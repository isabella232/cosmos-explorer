import * as Constants from "../Common/Constants";
import * as DataExplorerConstants from "../Common/Constants";
import * as DataModels from "../Contracts/DataModels";
import * as ViewModels from "../Contracts/ViewModels";
import EnvironmentUtility from "./EnvironmentUtility";
import queryString from "querystring";
import { AddDbUtilities } from "../Shared/AddDatabaseUtility";
import { ApiType, HttpHeaders, HttpStatusCodes } from "./Constants";
import { AuthType } from "../AuthType";
import { Collection } from "../Contracts/ViewModels";
import { config } from "../Config";
import { ConsoleDataType } from "../Explorer/Menus/NotificationConsole/NotificationConsoleComponent";
import { Constants as CosmosSDKConstants } from "@azure/cosmos";
import { CosmosClient } from "./CosmosClient";
import { MessageHandler } from "./MessageHandler";
import { MessageTypes } from "../Contracts/ExplorerContracts";
import { NotificationConsoleUtils } from "../Utils/NotificationConsoleUtils";
import { ResourceProviderClient } from "../ResourceProvider/ResourceProviderClient";

const defaultHeaders = {
  [HttpHeaders.apiType]: ApiType.MongoDB.toString(),
  [CosmosSDKConstants.HttpHeaders.MaxEntityCount]: "100",
  [CosmosSDKConstants.HttpHeaders.Version]: "2017-11-15"
};

function authHeaders(): any {
  if (window.authType === AuthType.EncryptedToken) {
    return { [HttpHeaders.guestAccessToken]: CosmosClient.accessToken() };
  } else {
    return { [HttpHeaders.authorization]: CosmosClient.authorizationToken() };
  }
}

export function queryIterator(databaseId: string, collection: Collection, query: string) {
  let continuationToken: string = null;
  return {
    fetchNext: () => {
      return queryDocuments(databaseId, collection, false, query).then(response => {
        continuationToken = response.continuationToken;
        let headers = {} as any;
        response.headers.forEach((value: any, key: any) => {
          headers[key] = value;
        });
        return {
          resources: response.documents,
          headers,
          requestCharge: headers[CosmosSDKConstants.HttpHeaders.RequestCharge],
          activityId: headers[CosmosSDKConstants.HttpHeaders.ActivityId],
          hasMoreResults: !!continuationToken
        };
      });
    }
  };
}

interface QueryResponse {
  continuationToken: string;
  documents: DataModels.DocumentId[];
  headers: Headers;
}

export function queryDocuments(
  databaseId: string,
  collection: Collection,
  isResourceList: boolean,
  query: string,
  continuationToken?: string
): Promise<QueryResponse> {
  const databaseAccount = CosmosClient.databaseAccount();
  const resourceEndpoint = databaseAccount.properties.mongoEndpoint || databaseAccount.properties.documentEndpoint;
  const params = {
    db: databaseId,
    coll: collection.id(),
    resourceUrl: `${resourceEndpoint}dbs/${databaseId}/colls/${collection.id()}/docs/`,
    rid: collection.rid,
    rtype: "docs",
    sid: CosmosClient.subscriptionId(),
    rg: CosmosClient.resourceGroup(),
    dba: databaseAccount.name,
    pk:
      collection && collection.partitionKey && !collection.partitionKey.systemKey ? collection.partitionKeyProperty : ""
  };

  const endpoint = getEndpoint(databaseAccount) || "";

  const headers = {
    ...defaultHeaders,
    ...authHeaders(),
    [CosmosSDKConstants.HttpHeaders.IsQuery]: "true",
    [CosmosSDKConstants.HttpHeaders.PopulateQueryMetrics]: "true",
    [CosmosSDKConstants.HttpHeaders.EnableScanInQuery]: "true",
    [CosmosSDKConstants.HttpHeaders.EnableCrossPartitionQuery]: "true",
    [CosmosSDKConstants.HttpHeaders.ParallelizeCrossPartitionQuery]: "true",
    [HttpHeaders.contentType]: "application/query+json"
  };

  if (continuationToken) {
    headers[CosmosSDKConstants.HttpHeaders.Continuation] = continuationToken;
  }

  const path = isResourceList ? "/resourcelist" : "";

  return window
    .fetch(`${endpoint}${path}?${queryString.stringify(params)}`, {
      method: "POST",
      body: JSON.stringify({ query }),
      headers
    })
    .then(async response => {
      if (response.ok) {
        return {
          continuationToken: response.headers.get(CosmosSDKConstants.HttpHeaders.Continuation),
          documents: (await response.json()).Documents as DataModels.DocumentId[],
          headers: response.headers
        };
      }
      const errorMessage = await response.text();
      if (response.status === HttpStatusCodes.Forbidden) {
        MessageHandler.sendMessage({
          type: MessageTypes.ForbiddenError,
          reason: errorMessage
        });
      }
      throw new Error(errorMessage);
    });
}

export function readDocument(
  databaseId: string,
  collection: Collection,
  documentId: ViewModels.DocumentId
): Promise<DataModels.DocumentId> {
  const databaseAccount = CosmosClient.databaseAccount();
  const resourceEndpoint = databaseAccount.properties.mongoEndpoint || databaseAccount.properties.documentEndpoint;
  const idComponents = documentId.self.split("/");
  const path = idComponents.slice(0, 4).join("/");
  const rid = encodeURIComponent(idComponents[5]);
  const params = {
    db: databaseId,
    coll: collection.id(),
    resourceUrl: `${resourceEndpoint}${path}/${rid}`,
    rid,
    rtype: "docs",
    sid: CosmosClient.subscriptionId(),
    rg: CosmosClient.resourceGroup(),
    dba: databaseAccount.name,
    pk:
      documentId && documentId.partitionKey && !documentId.partitionKey.systemKey ? documentId.partitionKeyProperty : ""
  };

  const endpoint = getEndpoint(databaseAccount);
  return window
    .fetch(`${endpoint}?${queryString.stringify(params)}`, {
      method: "GET",
      headers: {
        ...defaultHeaders,
        ...authHeaders(),
        [CosmosSDKConstants.HttpHeaders.PartitionKey]: encodeURIComponent(
          JSON.stringify(documentId.partitionKeyHeader())
        )
      }
    })
    .then(async response => {
      if (response.ok) {
        return response.json();
      }
      errorHandling(response);
    });
}

export function createDocument(
  databaseId: string,
  collection: Collection,
  partitionKeyProperty: string,
  documentContent: any
): Promise<DataModels.DocumentId> {
  const databaseAccount = CosmosClient.databaseAccount();
  const resourceEndpoint = databaseAccount.properties.mongoEndpoint || databaseAccount.properties.documentEndpoint;
  const params = {
    db: databaseId,
    coll: collection.id(),
    resourceUrl: `${resourceEndpoint}dbs/${databaseId}/colls/${collection.id()}/docs/`,
    rid: collection.rid,
    rtype: "docs",
    sid: CosmosClient.subscriptionId(),
    rg: CosmosClient.resourceGroup(),
    dba: databaseAccount.name,
    pk: collection && collection.partitionKey && !collection.partitionKey.systemKey ? partitionKeyProperty : ""
  };

  const endpoint = getEndpoint(databaseAccount);

  return window
    .fetch(`${endpoint}/resourcelist?${queryString.stringify(params)}`, {
      method: "POST",
      body: JSON.stringify(documentContent),
      headers: {
        ...defaultHeaders,
        ...authHeaders()
      }
    })
    .then(async response => {
      if (response.ok) {
        return response.json();
      }
      errorHandling(response);
    });
}

export function updateDocument(
  databaseId: string,
  collection: Collection,
  documentId: ViewModels.DocumentId,
  documentContent: any
): Promise<DataModels.DocumentId> {
  const databaseAccount = CosmosClient.databaseAccount();
  const resourceEndpoint = databaseAccount.properties.mongoEndpoint || databaseAccount.properties.documentEndpoint;
  const idComponents = documentId.self.split("/");
  const path = idComponents.slice(0, 5).join("/");
  const rid = encodeURIComponent(idComponents[5]);
  const params = {
    db: databaseId,
    coll: collection.id(),
    resourceUrl: `${resourceEndpoint}${path}/${rid}`,
    rid,
    rtype: "docs",
    sid: CosmosClient.subscriptionId(),
    rg: CosmosClient.resourceGroup(),
    dba: databaseAccount.name,
    pk:
      documentId && documentId.partitionKey && !documentId.partitionKey.systemKey ? documentId.partitionKeyProperty : ""
  };
  const endpoint = getEndpoint(databaseAccount);

  return window
    .fetch(`${endpoint}?${queryString.stringify(params)}`, {
      method: "PUT",
      body: documentContent,
      headers: {
        ...defaultHeaders,
        ...authHeaders(),
        [HttpHeaders.contentType]: "application/json",
        [CosmosSDKConstants.HttpHeaders.PartitionKey]: JSON.stringify(documentId.partitionKeyHeader())
      }
    })
    .then(async response => {
      if (response.ok) {
        return response.json();
      }
      errorHandling(response);
    });
}

export function deleteDocument(
  databaseId: string,
  collection: Collection,
  documentId: ViewModels.DocumentId
): Promise<any> {
  const databaseAccount = CosmosClient.databaseAccount();
  const resourceEndpoint = databaseAccount.properties.mongoEndpoint || databaseAccount.properties.documentEndpoint;
  const idComponents = documentId.self.split("/");
  const path = idComponents.slice(0, 5).join("/");
  const rid = encodeURIComponent(idComponents[5]);
  const params = {
    db: databaseId,
    coll: collection.id(),
    resourceUrl: `${resourceEndpoint}${path}/${rid}`,
    rid,
    rtype: "docs",
    sid: CosmosClient.subscriptionId(),
    rg: CosmosClient.resourceGroup(),
    dba: databaseAccount.name,
    pk:
      documentId && documentId.partitionKey && !documentId.partitionKey.systemKey ? documentId.partitionKeyProperty : ""
  };
  const endpoint = getEndpoint(databaseAccount);

  return window
    .fetch(`${endpoint}?${queryString.stringify(params)}`, {
      method: "DELETE",
      headers: {
        ...defaultHeaders,
        ...authHeaders(),
        [HttpHeaders.contentType]: "application/json",
        [CosmosSDKConstants.HttpHeaders.PartitionKey]: JSON.stringify(documentId.partitionKeyHeader())
      }
    })
    .then(async response => {
      if (response.ok) {
        return;
      }
      errorHandling(response);
    });
}

export function createMongoCollectionWithProxy(
  databaseId: string,
  collectionId: string,
  offerThroughput: number,
  shardKey: string,
  createDatabase: boolean,
  sharedThroughput: boolean,
  isSharded: boolean,
  autopilotOptions?: DataModels.RpOptions
): Promise<any> {
  const databaseAccount = CosmosClient.databaseAccount();
  const params: DataModels.MongoParameters = {
    resourceUrl: databaseAccount.properties.mongoEndpoint || databaseAccount.properties.documentEndpoint,
    db: databaseId,
    coll: collectionId,
    pk: shardKey,
    offerThroughput,
    cd: createDatabase,
    st: sharedThroughput,
    is: isSharded,
    rid: "",
    rtype: "colls",
    sid: CosmosClient.subscriptionId(),
    rg: CosmosClient.resourceGroup(),
    dba: databaseAccount.name,
    isAutoPilot: false
  };

  if (autopilotOptions) {
    params.isAutoPilot = true;
    params.autoPilotTier = autopilotOptions[Constants.HttpHeaders.autoPilotTier] as string;
  }

  const endpoint = getEndpoint(databaseAccount);

  return window
    .fetch(
      `${endpoint}/createCollection?${queryString.stringify((params as unknown) as queryString.ParsedUrlQueryInput)}`,
      {
        method: "POST",
        headers: {
          ...defaultHeaders,
          ...authHeaders(),
          [HttpHeaders.contentType]: "application/json"
        }
      }
    )
    .then(async response => {
      if (response.ok) {
        return;
      }
      NotificationConsoleUtils.logConsoleMessage(
        ConsoleDataType.Error,
        `Error creating collection: ${await response.json()}, Payload: ${params}`
      );
      errorHandling(response);
    });
}

export function createMongoCollectionWithARM(
  armEndpoint: string,
  databaseId: string,
  analyticalStorageTtl: number,
  isFixedCollectionWithSharedThroughputBeingCreated: boolean,
  collectionId: string,
  offerThroughput: number,
  shardKey: string,
  createDatabase: boolean,
  sharedThroughput: boolean,
  isSharded: boolean,
  additionalOptions?: DataModels.RpOptions
): Promise<any> {
  const databaseAccount = CosmosClient.databaseAccount();
  const params: DataModels.MongoParameters = {
    resourceUrl: databaseAccount.properties.mongoEndpoint || databaseAccount.properties.documentEndpoint,
    db: databaseId,
    coll: collectionId,
    pk: shardKey,
    offerThroughput,
    cd: createDatabase,
    st: sharedThroughput,
    is: isSharded,
    rid: "",
    rtype: "colls",
    sid: CosmosClient.subscriptionId(),
    rg: CosmosClient.resourceGroup(),
    dba: databaseAccount.name,
    analyticalStorageTtl,
    isFixedCollectionWithSharedThroughputBeingCreated
  };

  if (createDatabase) {
    return AddDbUtilities.createMongoDatabaseWithARM(
      armEndpoint,
      params,
      sharedThroughput ? additionalOptions : {}
    ).then(() => {
      return _createMongoCollectionWithARM(armEndpoint, params, sharedThroughput ? {} : additionalOptions);
    });
  }
  return _createMongoCollectionWithARM(armEndpoint, params, additionalOptions);
}

export function getEndpoint(databaseAccount: ViewModels.DatabaseAccount): string {
  const serverId = window.dataExplorer.serverId();
  const extensionEndpoint = window.dataExplorer.extensionEndpoint();
  let url = config.MONGO_BACKEND_ENDPOINT
    ? config.MONGO_BACKEND_ENDPOINT + "/api/mongo/explorer"
    : EnvironmentUtility.getMongoBackendEndpoint(serverId, databaseAccount.location, extensionEndpoint);

  if (window.authType === AuthType.EncryptedToken) {
    url = url.replace("api/mongo", "api/guest/mongo");
  }
  return url;
}

async function errorHandling(response: any): Promise<any> {
  const errorMessage = await response.text();
  if (response.status === HttpStatusCodes.Forbidden) {
    MessageHandler.sendMessage({
      type: MessageTypes.ForbiddenError,
      reason: errorMessage
    });
  }
  throw new Error(errorMessage);
}

export function getARMCreateCollectionEndpoint(params: DataModels.MongoParameters): string {
  return `subscriptions/${params.sid}/resourceGroups/${params.rg}/providers/Microsoft.DocumentDB/databaseAccounts/${
    CosmosClient.databaseAccount().name
  }/mongodbDatabases/${params.db}/collections/${params.coll}`;
}

export async function _createMongoCollectionWithARM(
  armEndpoint: string,
  params: DataModels.MongoParameters,
  rpOptions: DataModels.RpOptions
): Promise<any> {
  const rpPayloadToCreateCollection: DataModels.MongoCreationRequest = {
    properties: {
      resource: {
        id: params.coll
      },
      options: {}
    }
  };

  if (params.is) {
    rpPayloadToCreateCollection.properties.resource["shardKey"] = { [params.pk]: "Hash" };
  }

  if (!params.st) {
    if (rpOptions) {
      rpPayloadToCreateCollection.properties.options = rpOptions;
    } else {
      rpPayloadToCreateCollection.properties.options["throughput"] =
        params.offerThroughput && params.offerThroughput.toString();
    }
  }

  if (params.isFixedCollectionWithSharedThroughputBeingCreated) {
    rpPayloadToCreateCollection.properties.options[Constants.HttpHeaders.mongoFixedCollectionWithSharedThroughput] =
      "true";
  }

  if (params.analyticalStorageTtl) {
    rpPayloadToCreateCollection.properties.resource.analyticalStorageTtl = params.analyticalStorageTtl;
  }

  try {
    await new ResourceProviderClient(armEndpoint).putAsync(
      getARMCreateCollectionEndpoint(params),
      DataExplorerConstants.ArmApiVersions.publicVersion,
      rpPayloadToCreateCollection
    );
  } catch (response) {
    NotificationConsoleUtils.logConsoleMessage(
      ConsoleDataType.Error,
      `Error creating collection: ${JSON.stringify(response)}`
    );
    if (response.status === HttpStatusCodes.Forbidden) {
      MessageHandler.sendMessage({ type: MessageTypes.ForbiddenError });
      return;
    }
    throw new Error(`Error creating collection`);
  }
}