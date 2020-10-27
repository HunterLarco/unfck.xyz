import Joi from 'joi';

import ApiPostSchema from '@/src/server/types/api/Post';
import JsonEndpoint from '@/src/server/helpers/net/JsonEndpoint';
import getCurrentUser from '@/src/server/helpers/net/getCurrentUser';

import * as PostTable from '@/src/server/firestore/Post';
import * as postHelpers from '@/src/server/helpers/data/Post';

const RequestSchema = Joi.alternatives().conditional('.type', {
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

const ResponseSchema = Joi.object({
  post: ApiPostSchema.required(),
});

async function handler(environment, request, headers) {
  const { id: accountId } = await getCurrentUser(environment, headers, {
    required: true,
  });

  const { id, post } = await PostTable.create(
    environment,
    null,
    postHelpers.create(request, accountId)
  );

  return {
    post: await ApiPostSchema.fromFirestorePost(environment, id, post, {
      accountId,
    }),
  };
}

export default JsonEndpoint.factory(handler, {
  RequestSchema,
  ResponseSchema,
});
