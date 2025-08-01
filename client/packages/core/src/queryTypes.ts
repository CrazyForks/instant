// Query
// -----

import type {
  EntitiesDef,
  IContainEntitiesAndLinks,
  InstantGraph,
  LinkAttrDef,
  RuleParams,
  ResolveAttrs,
  ResolveEntityAttrs,
  DataAttrDef,
  AttrsDefs,
  EntityDef,
  EntityDefFromSchema,
} from './schemaTypes.ts';

type BuiltIn = Date | Function | Error | RegExp;

type Primitive = string | number | boolean | symbol | null | undefined;

export type Expand<T> = T extends BuiltIn | Primitive
  ? T
  : T extends object
    ? T extends infer O
      ? { [K in keyof O]: Expand<O[K]> }
      : never
    : T;

// NonEmpty disallows {}, so that you must provide at least one field
type NonEmpty<T> = {
  [K in keyof T]-?: Required<Pick<T, K>>;
}[keyof T];

type BaseWhereClauseValueComplex<V> = {
  /** @deprecated use `$in` instead of `in` */
  in?: V[];
  $in?: V[];
  $not?: V;
  $gt?: V;
  $lt?: V;
  $gte?: V;
  $lte?: V;
};

type IsAny<T> = boolean extends (T extends never ? true : false) ? true : false;

type WhereClauseValueComplex<V, R, I> = BaseWhereClauseValueComplex<V> &
  (IsAny<V> extends true
    ? {
        $ilike?: string;
        $like?: string;
        $isNull?: boolean;
      }
    : (V extends string
        ? {
            $like?: string;
          }
        : {}) &
        (R extends false
          ? {
              $isNull?: boolean;
            }
          : {}) &
        (I extends true
          ? {
              $ilike?: string;
            }
          : {}));

// Make type display better
type WhereClauseValue<
  D extends DataAttrDef<string | number | boolean, boolean, boolean>,
> =
  D extends DataAttrDef<infer V, infer R, infer I>
    ?
        | (IsAny<V> extends true ? string | number | boolean : V)
        | NonEmpty<WhereClauseValueComplex<V, R, I>>
    : never;

type WhereClauseColumnEntries<
  T extends {
    [key: string]: DataAttrDef<any, boolean, boolean>;
  },
> = {
  [key in keyof T]?: WhereClauseValue<T[key]>;
};

type WhereClauseComboEntries<
  T extends Record<any, DataAttrDef<any, boolean, boolean>>,
> = {
  or?: WhereClauses<T>[] | WhereClauseValue<DataAttrDef<any, false, true>>;
  and?: WhereClauses<T>[] | WhereClauseValue<DataAttrDef<any, false, true>>;
};

type WhereClauses<T extends Record<any, DataAttrDef<any, boolean, boolean>>> = (
  | WhereClauseComboEntries<T>
  | (WhereClauseComboEntries<T> & WhereClauseColumnEntries<T>)
) & {
  id?: WhereClauseValue<DataAttrDef<string, false, true>>;
  [key: `${string}.${string}`]: WhereClauseValue<DataAttrDef<any, false, true>>;
};

/**
 * A tuple representing a cursor.
 * These should not be constructed manually. The current format
 * is an implementation detail that may change in the future.
 * Use the `endCursor` or `startCursor` from the PageInfoResponse as the
 * `before` or `after` field in the query options.
 */
type Cursor = [string, string, any, number];

type Direction = 'asc' | 'desc';

type IndexedKeys<Attrs extends AttrsDefs> = {
  [K in keyof Attrs]: Attrs[K] extends DataAttrDef<any, any, infer IsIndexed>
    ? IsIndexed extends true
      ? K
      : never
    : never;
}[keyof Attrs];

type Order<
  Schema extends IContainEntitiesAndLinks<any, any>,
  EntityName extends keyof Schema['entities'],
> =
  IndexedKeys<Schema['entities'][EntityName]['attrs']> extends never
    ? {
        serverCreatedAt?: Direction;
      }
    : {
        [K in IndexedKeys<Schema['entities'][EntityName]['attrs']>]?: Direction;
      } & {
        serverCreatedAt?: Direction;
      };

type $Option<
  S extends IContainEntitiesAndLinks<any, any>,
  K extends keyof S['entities'],
> = {
  $?: {
    where?: WhereClauses<EntityDefFromSchema<S, K>>;
    order?: Order<S, K>;
    limit?: number;
    last?: number;
    first?: number;
    offset?: number;
    after?: Cursor;
    before?: Cursor;
    fields?: InstaQLFields<S, K>;
  };
};

type NamespaceVal =
  | $Option<IContainEntitiesAndLinks<any, any>, keyof EntitiesDef>
  | ($Option<IContainEntitiesAndLinks<any, any>, keyof EntitiesDef> & Subquery);

type Subquery = { [namespace: string]: NamespaceVal };

interface Query {
  [namespace: string]: NamespaceVal;
}

type InstantObject = {
  id: string;
  [prop: string]: any;
};

type ResponseObject<K, Schema> = K extends keyof Schema
  ? { id: string } & Schema[K]
  : InstantObject;

type IsEmptyObject<T> = T extends Record<string, never> ? true : false;

type ResponseOf<Q, Schema> = {
  [K in keyof Q]: IsEmptyObject<Q[K]> extends true
    ? ResponseObject<K, Schema>[]
    : (ResponseOf<Q[K], Schema> & ResponseObject<K, Schema>)[];
};

type Remove$<T> = T extends object
  ? { [K in keyof T as Exclude<K, '$'>]: Remove$<T[K]> }
  : T;

type Remove$NonRecursive<T> = T extends object
  ? { [K in keyof T as Exclude<K, '$'>]: T[K] }
  : T;

type QueryResponse<
  Q,
  Schema,
  WithCardinalityInference extends boolean = false,
  UseDates extends boolean = false,
> =
  Schema extends InstantGraph<infer E, any>
    ? InstaQLQueryResult<E, Q, WithCardinalityInference, UseDates>
    : ResponseOf<{ [K in keyof Q]: Remove$<Q[K]> }, Schema>;

type InstaQLResponse<Schema, Q, UseDates extends boolean = false> =
  Schema extends IContainEntitiesAndLinks<any, any>
    ? InstaQLResult<Schema, Q, UseDates>
    : never;

type PageInfoResponse<T> = {
  [K in keyof T]: {
    startCursor: Cursor;
    endCursor: Cursor;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

/**
 * (XXX)
 * https://github.com/microsoft/TypeScript/issues/26051
 *
 * Typescript can permit extra keys when a generic extends a type.
 *
 * For some reason, it makes it possible to write a query like so:
 *
 * dummyQuery({
 *  users: {
 *    $: { where: { "foo": 1 } },
 *    posts: {
 *      $: { "far": {} }
 *    }
 *  }
 *
 *  The problem: $: { "far": {} }
 *
 *  This passes, when it should in reality fail. I don't know why
 *  adding `Exactly` fixes this, but it does.
 *
 * */
type Exactly<Parent, Child> = Parent & {
  [K in keyof Child]: K extends keyof Parent ? Child[K] : never;
};

// ==========
// InstaQL helpers

type InstaQLEntitySubqueryResult<
  Schema extends IContainEntitiesAndLinks<EntitiesDef, any>,
  EntityName extends keyof Schema['entities'],
  Query extends InstaQLEntitySubquery<Schema, EntityName> = {},
  UseDates extends boolean = false,
> = {
  [QueryPropName in keyof Query]: Schema['entities'][EntityName]['links'][QueryPropName] extends LinkAttrDef<
    infer Cardinality,
    infer LinkedEntityName
  >
    ? LinkedEntityName extends keyof Schema['entities']
      ? Cardinality extends 'one'
        ?
            | InstaQLEntity<
                Schema,
                LinkedEntityName,
                Remove$NonRecursive<Query[QueryPropName]>,
                Query[QueryPropName]['$']['fields'],
                UseDates
              >
            | undefined
        : InstaQLEntity<
            Schema,
            LinkedEntityName,
            Remove$NonRecursive<Query[QueryPropName]>,
            Query[QueryPropName]['$']['fields'],
            UseDates
          >[]
      : never
    : never;
};

type InstaQLQueryEntityLinksResult<
  Entities extends EntitiesDef,
  EntityName extends keyof Entities,
  Query extends {
    [LinkAttrName in keyof Entities[EntityName]['links']]?: any;
  },
  WithCardinalityInference extends boolean,
  UseDates extends boolean = false,
> = {
  [QueryPropName in keyof Query]: Entities[EntityName]['links'][QueryPropName] extends LinkAttrDef<
    infer Cardinality,
    infer LinkedEntityName
  >
    ? LinkedEntityName extends keyof Entities
      ? WithCardinalityInference extends true
        ? Cardinality extends 'one'
          ?
              | InstaQLQueryEntityResult<
                  Entities,
                  LinkedEntityName,
                  Query[QueryPropName],
                  WithCardinalityInference,
                  UseDates
                >
              | undefined
          : InstaQLQueryEntityResult<
              Entities,
              LinkedEntityName,
              Query[QueryPropName],
              WithCardinalityInference,
              UseDates
            >[]
        : InstaQLQueryEntityResult<
            Entities,
            LinkedEntityName,
            Query[QueryPropName],
            WithCardinalityInference,
            UseDates
          >[]
      : never
    : never;
};

// Pick, but applies the pick to each union
type DistributePick<T, K extends string> = T extends any
  ? { [P in K]: P extends keyof T ? T[P] : never }
  : never;

type InstaQLFields<
  S extends IContainEntitiesAndLinks<any, any>,
  K extends keyof S['entities'],
> = (Extract<keyof ResolveEntityAttrs<S['entities'][K]>, string> | 'id')[];

type InstaQLEntity<
  Schema extends IContainEntitiesAndLinks<EntitiesDef, any>,
  EntityName extends keyof Schema['entities'],
  Subquery extends InstaQLEntitySubquery<Schema, EntityName> = {},
  Fields extends InstaQLFields<Schema, EntityName> | undefined = undefined,
  UseDates extends boolean = false,
> = Expand<
  { id: string } & (Extract<Fields[number], string> extends undefined
    ? ResolveEntityAttrs<Schema['entities'][EntityName], UseDates>
    : DistributePick<
        ResolveEntityAttrs<Schema['entities'][EntityName], UseDates>,
        Exclude<Fields[number], 'id'>
      >) &
    InstaQLEntitySubqueryResult<Schema, EntityName, Subquery>
>;

type InstaQLQueryEntityResult<
  Entities extends EntitiesDef,
  EntityName extends keyof Entities,
  Query extends {
    [QueryPropName in keyof Entities[EntityName]['links']]?: any;
  },
  WithCardinalityInference extends boolean,
  UseDates extends boolean,
> = { id: string } & ResolveAttrs<Entities, EntityName, UseDates> &
  InstaQLQueryEntityLinksResult<
    Entities,
    EntityName,
    Query,
    WithCardinalityInference
  >;

type InstaQLQueryResult<
  Entities extends EntitiesDef,
  Query,
  WithCardinalityInference extends boolean,
  UseDates extends boolean,
> = {
  [QueryPropName in keyof Query]: QueryPropName extends keyof Entities
    ? InstaQLQueryEntityResult<
        Entities,
        QueryPropName,
        Query[QueryPropName],
        WithCardinalityInference,
        UseDates
      >[]
    : never;
};

type InstaQLResult<
  Schema extends IContainEntitiesAndLinks<EntitiesDef, any>,
  Query extends InstaQLParams<Schema>,
  UseDates extends boolean = false,
> = Expand<{
  [QueryPropName in keyof Query]: QueryPropName extends keyof Schema['entities']
    ? InstaQLEntity<
        Schema,
        QueryPropName,
        Remove$NonRecursive<Query[QueryPropName]>,
        Query[QueryPropName]['$']['fields'],
        UseDates
      >[]
    : never;
}>;

type InstaQLEntitySubquery<
  Schema extends IContainEntitiesAndLinks<EntitiesDef, any>,
  EntityName extends keyof Schema['entities'],
> = {
  [QueryPropName in keyof Schema['entities'][EntityName]['links']]?:
    | $Option<Schema, EntityName>
    | ($Option<Schema, EntityName> &
        InstaQLEntitySubquery<
          Schema,
          Schema['entities'][EntityName]['links'][QueryPropName]['entityName']
        >);
};

type InstaQLQuerySubqueryParams<
  S extends IContainEntitiesAndLinks<any, any>,
  E extends keyof S['entities'],
> = {
  [K in keyof S['entities'][E]['links']]?:
    | $Option<S, S['entities'][E]['links'][K]['entityName']>
    | ($Option<S, S['entities'][E]['links'][K]['entityName']> &
        InstaQLQuerySubqueryParams<
          S,
          S['entities'][E]['links'][K]['entityName']
        >);
};

type InstaQLParams<S extends IContainEntitiesAndLinks<any, any>> = {
  [K in keyof S['entities']]?:
    | $Option<S, K>
    | ($Option<S, K> & InstaQLQuerySubqueryParams<S, K>);
};

/**
 * @deprecated
 * `InstaQLQueryParams` is deprecated. Use `InstaQLParams` instead.
 *
 * @example
 * // Before
 * const myQuery = {...} satisfies InstaQLQueryParams<Schema>
 * // After
 * const myQuery = {...} satisfies InstaQLParams<Schema>
 */
type InstaQLQueryParams<S extends IContainEntitiesAndLinks<any, any>> =
  InstaQLParams<S>;

type InstaQLOptions = {
  ruleParams: RuleParams;
};

export {
  Query,
  QueryResponse,
  InstaQLResponse,
  PageInfoResponse,
  InstantObject,
  Exactly,
  Remove$,
  InstaQLQueryResult,
  InstaQLParams,
  InstaQLOptions,
  InstaQLQueryEntityResult,
  InstaQLEntitySubquery,
  InstaQLEntity,
  InstaQLResult,
  InstaQLFields,
  Cursor,
  InstaQLQueryParams,
};
