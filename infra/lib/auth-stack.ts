import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  SecretValue,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import type { Construct } from "constructs";
import { PROJECT, WEB_ORIGINS } from "./config.js";

export interface AuthStackProps extends StackProps {
  googleClientId?: string | undefined;
  googleSecretName?: string | undefined;
}

export class AuthStack extends Stack {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
  readonly domain: cognito.UserPoolDomain;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    this.userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: `${PROJECT}-users`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
      },
      passwordPolicy: {
        minLength: 10,
        requireLowercase: true,
        requireDigits: true,
        requireUppercase: false,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      mfa: cognito.Mfa.OFF,
      removalPolicy: RemovalPolicy.RETAIN,
      userVerification: {
        emailSubject: "Your Muxaris verification code",
        emailBody: "Welcome to Muxaris. Your verification code is {####}.",
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
    });

    const callbackUrls = WEB_ORIGINS.map((o) => `${o}/auth/callback`);
    const logoutUrls = WEB_ORIGINS.map((o) => `${o}/`);

    const providers: cognito.UserPoolClientIdentityProvider[] = [
      cognito.UserPoolClientIdentityProvider.COGNITO,
    ];
    let google: cognito.UserPoolIdentityProviderGoogle | undefined;
    if (props.googleClientId && props.googleSecretName) {
      google = new cognito.UserPoolIdentityProviderGoogle(this, "Google", {
        userPool: this.userPool,
        clientId: props.googleClientId,
        clientSecretValue: SecretValue.secretsManager(props.googleSecretName, {
          jsonField: "clientSecret",
        }),
        scopes: ["openid", "email", "profile"],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          fullname: cognito.ProviderAttribute.GOOGLE_NAME,
        },
      });
      providers.push(cognito.UserPoolClientIdentityProvider.GOOGLE);
    }

    this.userPoolClient = this.userPool.addClient("WebClient", {
      userPoolClientName: `${PROJECT}-web`,
      generateSecret: false,
      authFlows: { userSrp: true, userPassword: false },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls,
        logoutUrls,
      },
      supportedIdentityProviders: providers,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      preventUserExistenceErrors: true,
    });
    if (google) this.userPoolClient.node.addDependency(google);

    this.domain = this.userPool.addDomain("Domain", {
      cognitoDomain: { domainPrefix: `${PROJECT}-auth` },
    });

    new CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: this.userPoolClient.userPoolClientId });
    new CfnOutput(this, "UserPoolDomain", {
      value: `${this.domain.domainName}.auth.${this.region}.amazoncognito.com`,
    });
  }
}
