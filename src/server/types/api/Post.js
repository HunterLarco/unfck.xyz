import Joi from 'joi';

import PublicAccount from '@/src/server/types/api/PublicAccount';

import * as AccountTable from '@/src/server/firestore/Account';
import * as LikeTable from '@/src/server/firestore/Like';

const Content = Joi.alternatives().conditional('.type', {
  switch: [
    {
      is: 'question',
      then: Joi.object({
        type: 'question',
        question: Joi.string().required(),
        details: Joi.string().required(),
      }),
    },
    {
      is: 'url',
      then: Joi.object({
        type: 'url',
        summary: Joi.string().required(),
        url: Joi.string().uri().required(),
      }),
    },
    {
      is: 'opinion',
      then: Joi.object({
        type: 'opinion',
        summary: Joi.string().required(),
        details: Joi.string().required(),
      }),
    },
  ],
});

const Schema = Joi.object({
  id: Joi.string().required(),

  author: PublicAccount.required(),
  content: Content.required(),

  stats: Joi.object({
    likes: Joi.number().min(1).required(),
  }).required(),

  personalization: Joi.object({
    liked: Joi.boolean().required(),
    postedByYou: Joi.boolean().required(),
  }),

  dateCreated: Joi.date().required(),
});

Schema.fromFirestorePost = async (environment, id, post, options) => {
  const { accountId = null } = options || {};

  let personalization;
  if (accountId) {
    personalization = {
      liked: await LikeTable.exists(environment, null, accountId, id),
      postedByYou: post.author == accountId,
    };
  }

  const { account: author } = await AccountTable.get(
    environment,
    null,
    post.author
  );

  return {
    id,

    author: PublicAccount.fromFirestoreAccount(post.author, author),
    content: post.content,

    stats: {
      // TODO(hunter): fetch the most recent like count (perhaps with a cache)
      likes: Math.round(Math.random() * 100) + 1,
    },

    personalization: personalization,

    dateCreated: post.dateCreated,
  };
};

export default Schema;
