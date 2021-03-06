import Joi from 'joi';
import Mustache from 'mustache';

import ApiCommentSchema from '@/src/server/types/api/Comment';
import JsonEndpoint from '@/src/server/helpers/net/JsonEndpoint';
import getCurrentUser from '@/src/server/helpers/net/getCurrentUser';

import * as AccountTable from '@/src/server/firestore/Account';
import * as NotificationTable from '@/src/server/firestore/Notification';
import * as PostTable from '@/src/server/firestore/Post';
import * as commentHelpers from '@/src/server/helpers/data/Comment';

import Arena from '@/src/server/helpers/arena/Arena';

import HTMLCommentNotificationEmail from '@/src/server/emails/CommentNotification.mjml';
import PlainTextCommentNotificationEmail from '@/src/server/emails/CommentNotification.txt';

const RequestSchema = Joi.object({
  postId: Joi.string(),
  commentId: Joi.string(),

  content: Joi.object({
    text: Joi.string().required(),
  }),
}).xor('postId', 'commentId');

const ResponseSchema = Joi.object({
  comment: ApiCommentSchema.required(),
});

async function createCommentNotification(
  environment,
  transaction,
  { recipient, actorId, comment, target }
) {
  if (recipient == actorId) {
    return;
  }

  await NotificationTable.create(environment, transaction, {
    recipient,
    type: 'reply',
    details: {
      author: actorId,
      content: {
        comment: comment.id,
      },
      target,
    },
    read: false,
    dateCreated: new Date(),
  });
}

async function sendCommentNotification(
  environment,
  { actor, actorId, comment, parent }
) {
  const recipientId = parent.comment
    ? parent.comment.author
    : parent.post.author;

  if (recipientId == actorId) {
    return;
  }

  const { account: recipient } = await AccountTable.get(
    environment,
    null,
    recipientId
  );

  if (
    recipient.notificationSettings &&
    !recipient.notificationSettings.email.comments
  ) {
    return;
  }

  const contentType = parent.comment ? 'comment' : 'post';
  const contentUrl = `https://forum.mozillabuilders.com/comment/${comment.id}`;
  const subject = `${actor.username} responded to your ${contentType}`;

  if (process.fido.env == 'local') {
    console.log(`Emailing comment notification to ${recipient.email.raw}:`);
    console.log(`    Subject: ${subject}`);
    console.log(`    Content Url: ${contentUrl}`);
  } else {
    await environment.sparkpost.send({
      to: recipient.email.raw,
      subject,
      text: Mustache.render(PlainTextCommentNotificationEmail, {
        username: actor.username,
        contentType,
        contentUrl,
        commentBody: comment.content.text,
      }),
      html: Mustache.render(HTMLCommentNotificationEmail, {
        username: actor.username,
        contentType,
        contentUrl,
        commentBody: comment.content.text,
      }),
    });
  }
}

async function handler(environment, request, headers) {
  const { id: actorId, account: actor } = await getCurrentUser(
    environment,
    headers,
    { required: true }
  );

  const postId = request.postId
    ? request.postId
    : commentHelpers.postId(request.commentId);
  const commentId = request.commentId ? request.commentId : null;

  const { comment, parent } = await environment.firestore.runTransaction(
    async (transaction) => {
      const { post } = await PostTable.get(environment, transaction, postId);

      if (!post) {
        return Promise.reject({
          httpErrorCode: 404,
          name: 'ParentNotFound',
          message: `Post ${postId} does not exist.`,
        });
      }

      const comment = commentHelpers.create(
        postId,
        request.content.text,
        actorId
      );

      let parent;
      if (!commentId) {
        post.comments.push(comment);
        await createCommentNotification(environment, transaction, {
          recipient: post.author,
          actorId,
          comment,
          target: { post: postId },
        });
        parent = { post, postId };
      } else {
        const parentComment = commentHelpers.find(post, commentId);
        if (!parentComment) {
          return Promise.reject({
            httpErrorCode: 404,
            name: 'ParentNotFound',
            message: `Comment ${commentId} does not exist.`,
          });
        }
        parentComment.children.push(comment);
        await createCommentNotification(environment, transaction, {
          recipient: parentComment.author,
          actorId,
          comment,
          target: { comment: commentId },
        });
        parent = { comment: parentComment, commentId };
      }

      await PostTable.replace(environment, transaction, postId, post);

      return {
        comment,
        parent,
      };
    }
  );

  sendCommentNotification(environment, {
    actorId,
    actor,
    comment,
    parent,
  });

  const arena = new Arena(environment);
  arena.setActor(actorId, actor);
  arena.addComment(comment.id, comment);
  await arena.flush();

  return {
    comment: await ApiCommentSchema.fromArena(arena, comment.id),
  };
}

export default JsonEndpoint.factory(handler, {
  RequestSchema,
  ResponseSchema,
});
