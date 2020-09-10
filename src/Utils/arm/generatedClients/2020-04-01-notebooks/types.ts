/* 
  AUTOGENERATED FILE
  Do not manually edit
  Run "npm run generateARMClients" to regenerate
*/

/* Parameters to create a notebook workspace resource */
export type NotebookWorkspaceCreateUpdateParameters = unknown;

/* A list of notebook workspace resources */
export interface NotebookWorkspaceListResult {
  /* Array of notebook workspace resources */
  value?: NotebookWorkspace[];
}

/* A notebook workspace resource */
export type NotebookWorkspace = unknown & {
  /* Resource properties. */
  properties?: NotebookWorkspaceProperties;
};

/* Properties of a notebook workspace resource. */
export interface NotebookWorkspaceProperties {
  /* Specifies the endpoint of Notebook server. */
  readonly notebookServerEndpoint?: string;
  /* Status of the notebook workspace. Possible values are: Creating, Online, Deleting, Failed, Updating. */
  readonly status?: string;
}

/* The connection info for the given notebook workspace */
export interface NotebookWorkspaceConnectionInfoResult {
  /* Specifies auth token used for connecting to Notebook server (uses token-based auth). */
  readonly authToken?: string;
  /* Specifies the endpoint of Notebook server. */
  readonly notebookServerEndpoint?: string;
}
