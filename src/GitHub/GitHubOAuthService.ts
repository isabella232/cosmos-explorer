import ko from "knockout";
import { HttpStatusCodes } from "../Common/Constants";
import { Logger } from "../Common/Logger";
import { config } from "../Config";
import { ConsoleDataType } from "../Explorer/Menus/NotificationConsole/NotificationConsoleComponent";
import { JunoClient } from "../Juno/JunoClient";
import { isInvalidParentFrameOrigin } from "../Utils/MessageValidation";
import { NotificationConsoleUtils } from "../Utils/NotificationConsoleUtils";
import { GitHubConnectorMsgType, IGitHubConnectorParams } from "./GitHubConnector";

window.addEventListener("message", (event: MessageEvent) => {
  if (isInvalidParentFrameOrigin(event)) {
    return;
  }

  const msg = event.data;
  if (msg.type === GitHubConnectorMsgType) {
    const params = msg.data as IGitHubConnectorParams;
    window.dataExplorer.gitHubOAuthService.finishOAuth(params);
  }
});

export interface IGitHubOAuthToken {
  // API properties
  access_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

export class GitHubOAuthService {
  private static readonly OAuthEndpoint = "https://github.com/login/oauth/authorize";

  private state: string;
  private token: ko.Observable<IGitHubOAuthToken>;

  constructor(private junoClient: JunoClient) {
    this.token = ko.observable<IGitHubOAuthToken>();
  }

  public startOAuth(scope: string): string {
    const params = {
      scope,
      client_id: config.GITHUB_CLIENT_ID,
      redirect_uri: new URL("./connectToGitHub.html", window.location.href).href,
      state: this.resetState()
    };

    window.open(`${GitHubOAuthService.OAuthEndpoint}?${new URLSearchParams(params).toString()}`);
    return params.state;
  }

  public async finishOAuth(params: IGitHubConnectorParams) {
    try {
      this.validateState(params.state);
      const response = await this.junoClient.getGitHubToken(params.code);

      if (response.status === HttpStatusCodes.OK && !response.data.error) {
        NotificationConsoleUtils.logConsoleMessage(ConsoleDataType.Info, "Successfully connected to GitHub");
        this.token(response.data);
      } else {
        let errorMsg = response.data.error;
        if (response.data.error_description) {
          errorMsg = `${errorMsg}: ${response.data.error_description}`;
        }
        throw new Error(errorMsg);
      }
    } catch (error) {
      NotificationConsoleUtils.logConsoleMessage(ConsoleDataType.Error, `Failed to connect to GitHub: ${error}`);
      this.token({ error });
    }
  }

  public getTokenObservable(): ko.Observable<IGitHubOAuthToken> {
    return this.token;
  }

  public async logout() {
    try {
      const response = await this.junoClient.deleteAppAuthorization(this.token()?.access_token);
      if (response.status !== HttpStatusCodes.NoContent) {
        throw new Error(`Received HTTP ${response.status}: ${response.data} when deleting app authorization`);
      }

      this.resetToken();
    } catch (error) {
      const message = `Failed to delete app authorization: ${error}`;
      Logger.logError(message, "GitHubOAuthService/logout");
      NotificationConsoleUtils.logConsoleMessage(ConsoleDataType.Error, message);
    }
  }

  public isLoggedIn(): boolean {
    return !!this.token()?.access_token;
  }

  private resetState(): string {
    this.state = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER)).toString();
    return this.state;
  }

  public resetToken() {
    this.token(undefined);
  }

  private validateState(state: string) {
    if (state !== this.state) {
      throw new Error("State didn't match. Possibility of cross-site request forgery attack.");
    }
  }
}