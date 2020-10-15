import Joi from 'joi';

import ApiPostSchema from '@/src/server/types/api/Post';
import JsonEndpoint from '@/src/server/helpers/net/JsonEndpoint';
import getCurrentUser from '@/src/server/helpers/net/getCurrentUser';

import * as PostTable from '@/src/server/firestore/Post';

const RequestSchema = Joi.object({
  index: Joi.string().valid('new').required(),
  cursor: Joi.string().allow(null),
});

const ResponseSchema = Joi.object({
  posts: Joi.array().items(ApiPostSchema).required(),
  cursor: Joi.object({
    current: Joi.string().allow(null),
    next: Joi.string().allow(null),
  }),
});

async function handler(environment, request, headers) {
  const { id: accountId } = await getCurrentUser(environment, headers);

  const { posts, cursor } = await PostTable.queryByAge(environment, {
    cursor: request.cursor,
  });

  return {
    posts: await Promise.all(
      posts.map(({ id, post }) =>
        ApiPostSchema.fromFirestorePost(environment, id, post, { accountId })
      )
    ),

    cursor: {
      current: cursor.current || request.cursor || null,
      next: cursor.next,
    },
  };
}

export default JsonEndpoint.factory(handler, {
  RequestSchema,
  ResponseSchema,
});
