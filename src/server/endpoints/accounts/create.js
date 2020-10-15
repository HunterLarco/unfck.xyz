import * as dateFns from 'date-fns';
import Joi from 'joi';

import JsonEndpoint from '@/src/server/helpers/net/JsonEndpoint';

import * as AccountIdentityTable from '@/src/server/firestore/AccountIdentity';
import * as AuthTokenTable from '@/src/server/firestore/AuthToken';
import FirestoreEmailSchema from '@/src/server/types/firestore/Email';

const RequestSchema = Joi.object({
  email: Joi.string().email().required(),
  username: Joi.string().required(),
});

const ResponseSchema = Joi.object({});

async function handler(environment, request) {
  if (request.username.length < 3) {
    return Promise.reject({
      httpErrorCode: 400,
      name: 'InvalidUsername',
      message: 'Usernames must contain at least 3 characters',
    });
  } else if (!request.username.match(/^[a-zA-Z0-9_]+$/)) {
    return Promise.reject({
      httpErrorCode: 400,
      name: 'InvalidUsername',
      message: 'May only contain alphanumeric characters and underscores.',
    });
  }

  const email = FirestoreEmailSchema.fromText(request.email);

  if (
    await AccountIdentityTable.exists(
      environment,
      null,
      'normalizedEmail',
      email.normalized
    )
  ) {
    return Promise.reject({
      httpErrorCode: 412,
      name: 'EmailAlreadyExists',
      message: `Account already exists for email ${email.raw}`,
    });
  } else if (
    await AccountIdentityTable.exists(
      environment,
      null,
      'username',
      request.username
    )
  ) {
    return Promise.reject({
      httpErrorCode: 412,
      name: 'UsernameAlreadyExists',
      message: `Account already exists for username ${request.username}`,
    });
  }

  const { id } = await AuthTokenTable.create(environment, null, {
    dateCreated: new Date(),
    expiration: dateFns.addDays(new Date(), 1),
    scopes: {
      signup: {
        email,
        username: request.username,
      },
    },
  });

  console.log(id);

  return {};
}

export default JsonEndpoint.factory(handler, {
  RequestSchema,
  ResponseSchema,
});