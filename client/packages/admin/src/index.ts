import {
  tx,
  lookup,
  getOps,
  i,
  id,
  txInit,
  version as coreVersion,
  InstantAPIError,
  type InstantIssue,
  type TransactionChunk,
  type AuthToken,
  type Exactly,

  // core types
  type User,
  type Query,

  // query types
  type QueryResponse,
  type InstaQLResponse,
  type InstaQLParams,
  type InstaQLFields,
  type InstantQuery,
  type InstantQueryResult,
  type InstantSchema,
  type InstantSchemaDatabase,
  type InstantObject,
  type InstantEntity,
  type BackwardsCompatibleSchema,
  type IInstantDatabase,

  // schema types
  type AttrsDefs,
  type CardinalityKind,
  type DataAttrDef,
  type EntitiesDef,
  type EntitiesWithLinks,
  type EntityDef,
  type InstantGraph,
  type LinkAttrDef,
  type LinkDef,
  type LinksDef,
  type RoomsOf,
  type PresenceOf,
  type RoomHandle,
  type ResolveAttrs,
  type ValueTypes,
  type InstantSchemaDef,
  type InstantUnknownSchema,
  type InstaQLEntity,
  type InstaQLResult,
  type InstaQLEntitySubquery,
  type InstantRules,
  type UpdateParams,
  type LinkParams,
  type RuleParams,
  type TopicsOf,
  type TopicOf,

  // storage types
  type FileOpts,
  type UploadFileResponse,
  type DeleteFileResponse,
} from '@instantdb/core';

import version from './version.js';

type DebugCheckResult = {
  /** The ID of the record. */
  id: string;
  /** The namespace/table of the record. */
  entity: string;
  /** The value of the record. */
  record: Record<string, any>;
  /** The result of evaluating the corresponding permissions rule for a record. */
  check: any;
};

type Config = {
  appId: string;
  adminToken: string;
  apiURI?: string;
  useDateObjects?: boolean;
};

export type InstantConfig<
  Schema extends InstantSchemaDef<any, any, any>,
  UseDates extends boolean = false,
> = {
  appId: string;
  adminToken: string;
  apiURI?: string;
  schema?: Schema;
  useDateObjects?: UseDates;
};

type InstantConfigFilled<
  Schema extends InstantSchemaDef<any, any, any>,
  UseDates extends boolean,
> = InstantConfig<Schema, UseDates> & { apiURI: string };

type FilledConfig = Config & { apiURI: string };

type ImpersonationOpts =
  | { email: string }
  | { token: AuthToken }
  | { guest: boolean };

function configWithDefaults(config: Config): FilledConfig {
  const defaultConfig = {
    apiURI: 'https://api.instantdb.com',
  };
  const r = { ...defaultConfig, ...config };
  return r;
}

function instantConfigWithDefaults<
  Schema extends InstantSchemaDef<any, any, any>,
  UseDates extends boolean,
>(
  config: InstantConfig<Schema, UseDates>,
): InstantConfigFilled<Schema, UseDates> {
  const defaultConfig = {
    apiURI: 'https://api.instantdb.com',
  };
  const r = { ...defaultConfig, ...config };
  return r;
}

function withImpersonation(
  headers: { [key: string]: string },
  opts: ImpersonationOpts,
) {
  if ('email' in opts) {
    headers['as-email'] = opts.email;
  } else if ('token' in opts) {
    headers['as-token'] = opts.token;
  } else if ('guest' in opts) {
    headers['as-guest'] = 'true';
  }
  return headers;
}

function authorizedHeaders(
  config: FilledConfig,
  impersonationOpts?: ImpersonationOpts,
) {
  const { adminToken, appId } = config;
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${adminToken}`,
    'app-id': appId,
  };
  return impersonationOpts
    ? withImpersonation(headers, impersonationOpts)
    : headers;
}

// NextJS 13 and 14 cache fetch requests by default.
//
// Since adminDB.query uses fetch, this means that it would also cache by default.
//
// We don't want this behavior. `adminDB.query` should return the latest result by default.
//
// To get around this, we set an explicit `cache` header for NextJS 13 and 14.
// This is no longer needed in NextJS 15 onwards, as the default is `no-store` again.
// Once NextJS 13 and 14 are no longer common, we can remove this code.
function isNextJSVersionThatCachesFetchByDefault() {
  return (
    // NextJS 13 onwards added a `__nextPatched` property to the fetch function
    fetch['__nextPatched'] &&
    // NextJS 15 onwards _also_ added a global `next-patch` symbol.
    !globalThis[Symbol.for('next-patch')]
  );
}

function getDefaultFetchOpts(): RequestInit {
  return isNextJSVersionThatCachesFetchByDefault() ? { cache: 'no-store' } : {};
}

async function jsonFetch(
  input: RequestInfo,
  init: RequestInit | undefined,
): Promise<any> {
  const defaultFetchOpts = getDefaultFetchOpts();
  const headers = {
    ...(init.headers || {}),
    'Instant-Admin-Version': version,
    'Instant-Core-Version': coreVersion,
  };
  const res = await fetch(input, { ...defaultFetchOpts, ...init, headers });
  if (res.status === 200) {
    const json = await res.json();
    return Promise.resolve(json);
  }
  const body = await res.text();
  try {
    const json = JSON.parse(body);
    return Promise.reject(
      new InstantAPIError({ status: res.status, body: json }),
    );
  } catch (_e) {
    return Promise.reject(
      new InstantAPIError({
        status: res.status,
        body: { type: undefined, message: body },
      }),
    );
  }
}

/**
 *
 * The first step: init your application!
 *
 * Visit https://instantdb.com/dash to get your `appId` :)
 *
 * @example
 *  import { init } from "@instantdb/admin"
 *
 *  const db = init({
 *    appId: "my-app-id",
 *    adminToken: process.env.INSTANT_ADMIN_TOKEN
 *  })
 *
 *  // You can also provide a schema for type safety and editor autocomplete!
 *
 *  import { init } from "@instantdb/admin"
 *  import schema from ""../instant.schema.ts";
 *
 *  const db = init({
 *    appId: "my-app-id",
 *    adminToken: process.env.INSTANT_ADMIN_TOKEN,
 *    schema,
 *  })
 *  // To learn more: https://instantdb.com/docs/modeling-data
 */
function init<
  Schema extends InstantSchemaDef<any, any, any> = InstantUnknownSchema,
  UseDates extends boolean = false,
>(
  config: InstantConfig<Schema, UseDates>,
): InstantAdminDatabase<Schema, InstantConfig<Schema, UseDates>> {
  return new InstantAdminDatabase<Schema, InstantConfig<Schema, UseDates>>(
    config,
  );
}

/**
 * @deprecated
 * `init_experimental` is deprecated. You can replace it with `init`.
 *
 * @example
 *
 * // Before
 * import { init_experimental } from "@instantdb/admin"
 * const db = init_experimental({  ...  });
 *
 * // After
 * import { init } from "@instantdb/admin"
 * const db = init({ ...  });
 */
const init_experimental = init;

function steps(inputChunks) {
  const chunks = Array.isArray(inputChunks) ? inputChunks : [inputChunks];
  return chunks.flatMap(getOps);
}

type PresenceResult<Data> = {
  [peerId: string]: { data: Data; 'peer-id': string; user: User | null };
};

class Rooms<Schema extends InstantSchemaDef<any, any, any>> {
  config: FilledConfig;

  constructor(config: FilledConfig) {
    this.config = config;
  }

  async getPresence<RoomType extends keyof RoomsOf<Schema>>(
    roomType: RoomType,
    roomId: string,
  ): Promise<PresenceResult<PresenceOf<Schema, RoomType>>> {
    const res = await jsonFetch(
      `${this.config.apiURI}/admin/rooms/presence?room-type=${String(roomType)}&room-id=${roomId}`,
      {
        method: 'GET',
        headers: authorizedHeaders(this.config),
      },
    );

    return res.sessions || {};
  }
}

class Auth {
  config: FilledConfig;

  constructor(config: FilledConfig) {
    this.config = config;
  }

  /**
   * Generates a magic code for the user with the given email.
   * This is useful if you want to use your own email provider
   * to send magic codes.
   *
   * @example
   *   // Generate a magic code
   *   const { code } = await db.auth.generateMagicCode({ email })
   *   // Send the magic code to the user with your own email provider
   *   await customEmailProvider.sendMagicCode(email, code)
   *
   * @see https://instantdb.com/docs/backend#custom-magic-codes
   */
  generateMagicCode = async (email: string): Promise<{ code: string }> => {
    return jsonFetch(`${this.config.apiURI}/admin/magic_code`, {
      method: 'POST',
      headers: authorizedHeaders(this.config),
      body: JSON.stringify({ email }),
    });
  };

  /**
   * Sends a magic code to the user with the given email.
   * This uses Instant's built-in email provider.
   *
   * @example
   *   // Send an email to user with magic code
   *   await db.auth.sendMagicCode({ email })
   *
   * @see https://instantdb.com/docs/backend#custom-magic-codes
   */
  sendMagicCode = async (email: string): Promise<{ code: string }> => {
    return jsonFetch(`${this.config.apiURI}/admin/send_magic_code`, {
      method: 'POST',
      headers: authorizedHeaders(this.config),
      body: JSON.stringify({ email }),
    });
  };

  /**
   * Verifies a magic code for the user with the given email.
   *
   * @example
   *   const user = await db.auth.verifyMagicCode({ email, code })
   *   console.log("Verified user:", user)
   *
   * @see https://instantdb.com/docs/backend#custom-magic-codes
   */
  verifyMagicCode = async (email: string, code: string): Promise<User> => {
    const { user } = await jsonFetch(
      `${this.config.apiURI}/admin/verify_magic_code`,
      {
        method: 'POST',
        headers: authorizedHeaders(this.config),
        body: JSON.stringify({ email, code }),
      },
    );
    return user;
  };

  /**
   * Creates a login token for the user with the given email.
   * If that user does not exist, we create one.
   *
   * This is often useful for writing custom auth flows.
   *
   * @example
   *   app.post('/custom_sign_in', async (req, res) => {
   *     // ... your custom flow for users
   *     const token = await db.auth.createToken(email)
   *     return res.status(200).send({ token })
   *   })
   *
   * @see https://instantdb.com/docs/backend#custom-auth
   */
  createToken = async (email: string): Promise<AuthToken> => {
    const ret: { user: { refresh_token: string } } = await jsonFetch(
      `${this.config.apiURI}/admin/refresh_tokens`,
      {
        method: 'POST',
        headers: authorizedHeaders(this.config),
        body: JSON.stringify({ email }),
      },
    );
    return ret.user.refresh_token;
  };

  /**
   * Verifies a given token and returns the associated user.
   *
   * This is often useful for writing custom endpoints, where you need
   * to authenticate users.
   *
   * @example
   *   app.post('/custom_endpoint', async (req, res) => {
   *     const user = await db.auth.verifyToken(req.headers['token'])
   *     if (!user) {
   *       return res.status(401).send('Uh oh, you are not authenticated')
   *     }
   *     // ...
   *   })
   * @see https://instantdb.com/docs/backend#custom-endpoints
   */
  verifyToken = async (token: AuthToken): Promise<User> => {
    const res = await jsonFetch(
      `${this.config.apiURI}/runtime/auth/verify_refresh_token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          'app-id': this.config.appId,
          'refresh-token': token,
        }),
      },
    );
    return res.user;
  };

  /**
   * Retrieves an app user by id, email, or refresh token.
   *
   * @example
   *   try {
   *     const user = await db.auth.getUser({ email })
   *     console.log("Found user:", user)
   *   } catch (err) {
   *     console.error("Failed to retrieve user:", err.message);
   *   }
   *
   * @see https://instantdb.com/docs/backend#retrieve-a-user
   */
  getUser = async (
    params: { email: string } | { id: string } | { refresh_token: string },
  ): Promise<User> => {
    const qs = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');

    const response: { user: User } = await jsonFetch(
      `${this.config.apiURI}/admin/users?${qs}`,
      {
        method: 'GET',
        headers: authorizedHeaders(this.config),
      },
    );

    return response.user;
  };

  /**
   * Deletes an app user by id, email, or refresh token.
   *
   * NB: This _only_ deletes the user; it does not delete all user data.
   * You will need to handle this manually.
   *
   * @example
   *   try {
   *     const deletedUser = await db.auth.deleteUser({ email })
   *     console.log("Deleted user:", deletedUser)
   *   } catch (err) {
   *     console.error("Failed to delete user:", err.message);
   *   }
   *
   * @see https://instantdb.com/docs/backend#delete-a-user
   */
  deleteUser = async (
    params: { email: string } | { id: string } | { refresh_token: string },
  ): Promise<User> => {
    const qs = Object.entries(params).map(([k, v]) => `${k}=${v}`);
    const response: { deleted: User } = await jsonFetch(
      `${this.config.apiURI}/admin/users?${qs}`,
      {
        method: 'DELETE',
        headers: authorizedHeaders(this.config),
      },
    );

    return response.deleted;
  };

  /**
   * Signs out the user with the given email.
   * This invalidates any tokens associated with the user.
   * If the user is not found, an error will be thrown.
   *
   * @example
   *   try {
   *     await auth.signOut({ email: "alyssa_p_hacker@instantdb.com" });
   *     console.log("Successfully signed out");
   *   } catch (err) {
   *     console.error("Sign out failed:", err.message);
   *   }
   *
   * @see https://instantdb.com/docs/backend#sign-out
   */
  async signOut(
    params: { email: string } | { id: string } | { refresh_token: string },
  ): Promise<void>;

  /**
   * @deprecated Passing an email string directly is deprecated.
   * Use an object with the `email` key instead.
   *
   * @example
   * // Before
   * auth.signOut(email)
   *
   * // After
   * auth.signOut({ email })
   */
  async signOut(email: string): Promise<void>;

  async signOut(
    input:
      | string
      | { email: string }
      | { id: string }
      | { refresh_token: string },
  ): Promise<void> {
    // If input is a string, we assume it's an email.
    // This is because of backwards compatibility: we used to only
    // accept email strings. Eventually we can remove this
    const params = typeof input === 'string' ? { email: input } : input;
    const config = this.config;
    await jsonFetch(`${config.apiURI}/admin/sign_out`, {
      method: 'POST',
      headers: authorizedHeaders(config),
      body: JSON.stringify(params),
    });
  }
}

type StorageFile = {
  key: string;
  name: string;
  size: number;
  etag: string;
  last_modified: number;
};

type DeleteManyFileResponse = {
  data: {
    ids: string[] | null;
  };
};

/**
 * Functions to manage file storage.
 */
class Storage {
  config: FilledConfig;

  constructor(config: FilledConfig) {
    this.config = config;
  }

  /**
   * Uploads file at the provided path.
   *
   * @see https://instantdb.com/docs/storage
   * @example
   *   const buffer = fs.readFileSync('demo.png');
   *   const isSuccess = await db.storage.uploadFile('photos/demo.png', buffer);
   */
  uploadFile = async (
    path: string,
    file: Buffer,
    metadata: FileOpts = {},
  ): Promise<UploadFileResponse> => {
    const headers = {
      ...authorizedHeaders(this.config),
      path,
    };
    if (metadata.contentDisposition) {
      headers['content-disposition'] = metadata.contentDisposition;
    }

    // headers.content-type will become "undefined" (string)
    // if not removed from the object
    delete headers['content-type'];

    if (metadata.contentType) {
      headers['content-type'] = metadata.contentType;
    }

    const data = await jsonFetch(`${this.config.apiURI}/admin/storage/upload`, {
      method: 'PUT',
      headers,
      body: file,
    });

    return data;
  };

  /**
   * Deletes a file by its path name (e.g. "photos/demo.png").
   *
   * @see https://instantdb.com/docs/storage
   * @example
   *   await db.storage.delete("photos/demo.png");
   */
  delete = async (pathname: string): Promise<DeleteFileResponse> => {
    return jsonFetch(
      `${this.config.apiURI}/admin/storage/files?filename=${encodeURIComponent(
        pathname,
      )}`,
      {
        method: 'DELETE',
        headers: authorizedHeaders(this.config),
      },
    );
  };

  /**
   * Deletes multiple files by their path names (e.g. "photos/demo.png", "essays/demo.txt").
   *
   * @see https://instantdb.com/docs/storage
   * @example
   *   await db.storage.deleteMany(["images/1.png", "images/2.png", "images/3.png"]);
   */
  deleteMany = async (pathnames: string[]): Promise<DeleteManyFileResponse> => {
    return jsonFetch(`${this.config.apiURI}/admin/storage/files/delete`, {
      method: 'POST',
      headers: authorizedHeaders(this.config),
      body: JSON.stringify({ filenames: pathnames }),
    });
  };

  /**
   * @deprecated. This method will be removed in the future. Use `uploadFile`
   * instead
   */
  upload = async (
    pathname: string,
    file: Buffer,
    metadata: FileOpts = {},
  ): Promise<boolean> => {
    const { data: presignedUrl } = await jsonFetch(
      `${this.config.apiURI}/admin/storage/signed-upload-url`,
      {
        method: 'POST',
        headers: authorizedHeaders(this.config),
        body: JSON.stringify({
          app_id: this.config.appId,
          filename: pathname,
        }),
      },
    );
    const { ok } = await fetch(presignedUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': metadata.contentType,
      },
    });

    return ok;
  };

  /**
   * @deprecated. This method will be removed in the future. Use `query` instead
   * @example
   * const files = await db.query({ $files: {}})
   */
  list = async (): Promise<StorageFile[]> => {
    const { data } = await jsonFetch(
      `${this.config.apiURI}/admin/storage/files`,
      {
        method: 'GET',
        headers: authorizedHeaders(this.config),
      },
    );

    return data;
  };

  /**
   * @deprecated. getDownloadUrl will be removed in the future.
   * Use `query` instead to query and fetch for valid urls
   *
   * db.useQuery({
   *   $files: {
   *     $: {
   *       where: {
   *         path: "moop.png"
   *       }
   *     }
   *   }
   * })
   */
  getDownloadUrl = async (pathname: string): Promise<string> => {
    const { data } = await jsonFetch(
      `${this.config.apiURI}/admin/storage/signed-download-url?app_id=${this.config.appId}&filename=${encodeURIComponent(pathname)}`,
      {
        method: 'GET',
        headers: authorizedHeaders(this.config),
      },
    );

    return data;
  };
}

type AdminQueryOpts = {
  ruleParams?: RuleParams;
  fetchOpts?: RequestInit;
};

/**
 *
 * The first step: init your application!
 *
 * Visit https://instantdb.com/dash to get your `appId` and `adminToken` :)
 *
 * @example
 *  const db = init({ appId: "my-app-id", adminToken: "my-admin-token" })
 */
class InstantAdminDatabase<
  Schema extends InstantSchemaDef<any, any, any>,
  Config extends InstantConfig<Schema, boolean> = InstantConfig<Schema, false>,
> {
  config: InstantConfigFilled<Schema, Config['useDateObjects']>;
  auth: Auth;
  storage: Storage;
  rooms: Rooms<Schema>;
  impersonationOpts?: ImpersonationOpts;

  public tx = txInit<NonNullable<Schema>>();

  constructor(_config: Config) {
    this.config = instantConfigWithDefaults(_config);
    this.auth = new Auth(this.config);
    this.storage = new Storage(this.config);
    this.rooms = new Rooms<Schema>(this.config);
  }

  /**
   * Sometimes you want to scope queries to a specific user.
   *
   * You can provide a user's auth token, email, or impersonate a guest.
   *
   * @see https://instantdb.com/docs/backend#impersonating-users
   * @example
   *  await db.asUser({email: "stopa@instantdb.com"}).query({ goals: {} })
   */
  asUser = (opts: ImpersonationOpts): InstantAdminDatabase<Schema, Config> => {
    const newClient = new InstantAdminDatabase<Schema, Config>({
      ...(this.config as Config),
    });
    newClient.impersonationOpts = opts;
    return newClient;
  };

  /**
   * Use this to query your data!
   *
   * @see https://instantdb.com/docs/instaql
   *
   * @example
   *  // fetch all goals
   *  await db.query({ goals: {} })
   *
   *  // goals where the title is "Get Fit"
   *  await db.query({ goals: { $: { where: { title: "Get Fit" } } } })
   *
   *  // all goals, _alongside_ their todos
   *  await db.query({ goals: { todos: {} } })
   */
  query = <Q extends InstaQLParams<Schema>>(
    query: Q,
    opts: AdminQueryOpts = {},
  ): Promise<
    InstaQLResponse<Schema, Q, NonNullable<Config['useDateObjects']>>
  > => {
    if (query && opts && 'ruleParams' in opts) {
      query = { $$ruleParams: opts['ruleParams'], ...query };
    }
    const fetchOpts = opts.fetchOpts || {};
    const fetchOptsHeaders = fetchOpts['headers'] || {};
    return jsonFetch(`${this.config.apiURI}/admin/query`, {
      ...fetchOpts,
      method: 'POST',
      headers: {
        ...fetchOptsHeaders,
        ...authorizedHeaders(this.config, this.impersonationOpts),
      },
      body: JSON.stringify({
        query: query,
        'inference?': !!this.config.schema,
      }),
    });
  };

  /**
   * Use this to write data! You can create, update, delete, and link objects
   *
   * @see https://instantdb.com/docs/instaml
   *
   * @example
   *   // Create a new object in the `goals` namespace
   *   const goalId = id();
   *   db.transact(db.tx.goals[goalId].update({title: "Get fit"}))
   *
   *   // Update the title
   *   db.transact(db.tx.goals[goalId].update({title: "Get super fit"}))
   *
   *   // Delete it
   *   db.transact(db.tx.goals[goalId].delete())
   *
   *   // Or create an association:
   *   todoId = id();
   *   db.transact([
   *    db.tx.todos[todoId].update({ title: 'Go on a run' }),
   *    db.tx.goals[goalId].link({todos: todoId}),
   *  ])
   */
  transact = (
    inputChunks: TransactionChunk<any, any> | TransactionChunk<any, any>[],
  ) => {
    return jsonFetch(`${this.config.apiURI}/admin/transact`, {
      method: 'POST',
      headers: authorizedHeaders(this.config, this.impersonationOpts),
      body: JSON.stringify({
        steps: steps(inputChunks),
        'throw-on-missing-attrs?': !!this.config.schema,
      }),
    });
  };

  /**
   * Like `query`, but returns debugging information
   * for permissions checks along with the result.
   * Useful for inspecting the values returned by the permissions checks.
   * Note, this will return debug information for *all* entities
   * that match the query's `where` clauses.
   *
   * Requires a user/guest context to be set with `asUser`,
   * since permissions checks are user-specific.
   *
   * Accepts an optional configuration object with a `rules` key.
   * The provided rules will override the rules in the database for the query.
   *
   * @see https://instantdb.com/docs/instaql
   *
   * @example
   *  await db.asUser({ guest: true }).debugQuery(
   *    { goals: {} },
   *    { rules: { goals: { allow: { read: "auth.id != null" } } }
   *  )
   */
  debugQuery = async <Q extends InstaQLParams<Schema>>(
    query: Q,
    opts?: { rules?: any; ruleParams?: { [key: string]: any } },
  ): Promise<{
    result: InstaQLResponse<Schema, Q, Config['useDateObjects']>;
    checkResults: DebugCheckResult[];
  }> => {
    if (query && opts && 'ruleParams' in opts) {
      query = { $$ruleParams: opts['ruleParams'], ...query };
    }

    const response = await jsonFetch(
      `${this.config.apiURI}/admin/query_perms_check`,
      {
        method: 'POST',
        headers: authorizedHeaders(this.config, this.impersonationOpts),
        body: JSON.stringify({ query, 'rules-override': opts?.rules }),
      },
    );

    return {
      result: response.result,
      checkResults: response['check-results'],
    };
  };

  /**
   * Like `transact`, but does not write to the database.
   * Returns debugging information for permissions checks.
   * Useful for inspecting the values returned by the permissions checks.
   *
   * Requires a user/guest context to be set with `asUser`,
   * since permissions checks are user-specific.
   *
   * Accepts an optional configuration object with a `rules` key.
   * The provided rules will override the rules in the database for the duration of the transaction.
   *
   * @example
   *   const goalId = id();
   *   db.asUser({ guest: true }).debugTransact(
   *      [db.tx.goals[goalId].update({title: "Get fit"})],
   *      { rules: { goals: { allow: { update: "auth.id != null" } } }
   *   )
   */
  debugTransact = (
    inputChunks: TransactionChunk<any, any> | TransactionChunk<any, any>[],
    opts?: { rules?: any },
  ) => {
    return jsonFetch(`${this.config.apiURI}/admin/transact_perms_check`, {
      method: 'POST',
      headers: authorizedHeaders(this.config, this.impersonationOpts),
      body: JSON.stringify({
        steps: steps(inputChunks),
        'rules-override': opts?.rules,
        // @ts-expect-error because we're using a private API (for now)
        'dangerously-commit-tx': opts?.__dangerouslyCommit,
      }),
    });
  };
}

export {
  init,
  init_experimental,
  id,
  tx,
  lookup,
  i,

  // error
  InstantAPIError,

  // types
  type Config,
  type ImpersonationOpts,
  type TransactionChunk,
  type DebugCheckResult,
  type InstantAdminDatabase,

  // core types
  type User,
  type InstaQLParams,
  type Query,

  // query types
  type QueryResponse,
  type InstantQuery,
  type InstantQueryResult,
  type InstantSchema,
  type InstantSchemaDatabase,
  type IInstantDatabase,
  type InstantObject,
  type InstantEntity,
  type BackwardsCompatibleSchema,
  type InstaQLFields,

  // schema types
  type AttrsDefs,
  type CardinalityKind,
  type DataAttrDef,
  type EntitiesDef,
  type EntitiesWithLinks,
  type EntityDef,
  type InstantGraph,
  type LinkAttrDef,
  type LinkDef,
  type LinksDef,
  type ResolveAttrs,
  type RoomsOf,
  type PresenceOf,
  type RoomHandle,
  type ValueTypes,
  type InstantSchemaDef,
  type InstantUnknownSchema,
  type InstaQLEntity,
  type InstaQLResult,
  type InstaQLEntitySubquery,
  type InstantRules,
  type UpdateParams,
  type LinkParams,

  // storage types
  type FileOpts,
  type UploadFileResponse,
  type DeleteFileResponse,
  type DeleteManyFileResponse,

  // error types
  type InstantIssue,
};
