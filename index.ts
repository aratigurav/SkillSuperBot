// Import required packages
import * as restify from "restify";

// Import required bot services.
// See https://aka.ms/bot-services to learn more about the different parts of a bot.
import {
  CloudAdapter,
  ConfigurationServiceClientCredentialFactory,
  ConfigurationBotFrameworkAuthentication,
  TurnContext,
  MemoryStorage,
  SkillConversationIdFactory,
  CloudSkillHandler,
  ChannelServiceRoutes,
  ConversationState,
 } from "botbuilder";

import {
  allowedCallersClaimsValidator,
  AuthenticationConfiguration,
  AuthenticationConstants
} from "botframework-connector";

// This bot's main dialog.
import { TeamsBot } from "./teamsBot";
import config from "./config";
import { SkillsConfiguration } from "./skillsConfiguration";
import { Application, ConversationHistory, DefaultPromptManager, DefaultTurnState, OpenAIModerator, OpenAIPlanner, AI, AzureOpenAIPlanner } from '@microsoft/teams-ai';
import path from "path";
import * as responses from './responses';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ConversationState1 {
  lightsOn: boolean;
  skillbot:string;
}
type ApplicationTurnState = DefaultTurnState<ConversationState1>;
type TData = Record<string, any>;

// Create Azure open AI components
const planner = new AzureOpenAIPlanner<ApplicationTurnState>({
  apiKey: config.azureOpenAIKey,
  defaultModel: config.defaultmodel,
  endpoint : config.endpoint
}); 
const moderator = new OpenAIModerator({
  apiKey: config.openAIKey,
  moderate: 'both'
});
const promptManager = new DefaultPromptManager<ApplicationTurnState>(path.join(__dirname, './prompts' ));

// Define storage and application
const storage = new MemoryStorage();
const app = new Application<ApplicationTurnState>({
  storage,
  ai: {
      planner,
     // moderator,
      promptManager,
      prompt: 'chat',
      /*history: {
          assistantHistoryType: 'text'
      }*/
  }
});

// Add a prompt function for getting the current status of the lights
app.ai.prompts.addFunction('getLightStatus', async (context: TurnContext, state: ApplicationTurnState) => {
  return state.conversation.value.lightsOn ? 'on' : 'off';
});

// Register action handlers
app.ai.action('LightsOn', async (context: TurnContext, state: ApplicationTurnState) => {
  state.conversation.value.lightsOn = true;
  await context.sendActivity(`[lights on]`);
  return true;
});

app.ai.action('LightsOff', async (context: TurnContext, state: ApplicationTurnState) => {
  state.conversation.value.lightsOn = false;
  await context.sendActivity(`[lights off]`);
  return true;
});

app.ai.action('Pause', async (context: TurnContext, state: ApplicationTurnState, data: TData) => {
  const time = data.time ? parseInt(data.time) : 1000;
  await context.sendActivity(`[pausing for ${time / 1000} seconds]`);
  await new Promise((resolve) => setTimeout(resolve, time));
  return true;
});

app.ai.action('CallSkillBots', async (context: TurnContext, state: ApplicationTurnState, data: TData) => {
  state.conversation.value.lightsOn = false;
  await context.sendActivity(`[call skill bots]`);
  await bot.run(context);
  return true;
});
// Register a handler to handle unknown actions that might be predicted
app.ai.action(
  AI.UnknownActionName,
  async (context: TurnContext, state: ApplicationTurnState, data: TData, action: string | undefined) => {
      await context.sendActivity(responses.unknownAction(action || 'unknown'));
      return false;
  }
);

// Load skills configuration
const skillsConfig = new SkillsConfiguration();

//const allowedSkills = Object.values(skillsConfig.skills).map(skill => skill.appId);
//const allowedSkills=skillsConfig.skills.map(skill => skill.appId);
//const allowedSkills = Object.values(skillsConfig.skills).map(skill => skill.appId);
const allowedSkills = Object.values(skillsConfig.skills).map(skill => skill.appId);


const claimsValidators = allowedCallersClaimsValidator(allowedSkills);

// If the MicrosoftAppTenantId is specified in the environment config, add the tenant as a valid JWT token issuer for Bot to Skill conversation.
// The token issuer for MSI and single tenant scenarios will be the tenant where the bot is registered.
let validTokenIssuers = [];
const { MicrosoftAppTenantId } = process.env;

if (MicrosoftAppTenantId) {
    // For SingleTenant/MSI auth, the JWT tokens will be issued from the bot's home tenant.
    // Therefore, these issuers need to be added to the list of valid token issuers for authenticating activity requests.
    validTokenIssuers = [
        `${ AuthenticationConstants.ValidTokenIssuerUrlTemplateV1 }${ MicrosoftAppTenantId }/`,
        `${ AuthenticationConstants.ValidTokenIssuerUrlTemplateV2 }${ MicrosoftAppTenantId }/v2.0/`,
        `${ AuthenticationConstants.ValidGovernmentTokenIssuerUrlTemplateV1 }${ MicrosoftAppTenantId }/`,
        `${ AuthenticationConstants.ValidGovernmentTokenIssuerUrlTemplateV2 }${ MicrosoftAppTenantId }/v2.0/`
    ];
}
// Define our authentication configuration.
const authConfig = new AuthenticationConfiguration([], claimsValidators, validTokenIssuers);

// Create adapter.
// See https://aka.ms/about-bot-adapter to learn more about adapters.
const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
  MicrosoftAppId: config.botId,
  MicrosoftAppPassword: config.botPassword,
  MicrosoftAppType: "MultiTenant",
});

const botFrameworkAuthentication = new ConfigurationBotFrameworkAuthentication(
  process.env,
  credentialsFactory,
  authConfig
);

const adapter = new CloudAdapter(botFrameworkAuthentication);

// Catch-all for errors.
const onTurnErrorHandler = async (context: TurnContext, error: Error) => {
  // This check writes out errors to console log .vs. app insights.
  // NOTE: In production environment, you should consider logging this to Azure
  //       application insights.
  console.error(`\n [onTurnError] unhandled error: ${error}`);

  // Send a trace activity, which will be displayed in Bot Framework Emulator
  await context.sendTraceActivity(
    "OnTurnError Trace",
    `${error}`,
    "https://www.botframework.com/schemas/error",
    "TurnError"
  );

  // Send a message to the user
  await context.sendActivity(`The bot encountered unhandled error:\n ${error.message}`);
  await context.sendActivity("To continue to run this bot, please fix the bot source code.");
};

// Set the onTurnError for the singleton CloudAdapter.
adapter.onTurnError = onTurnErrorHandler;

const memoryStorage = new MemoryStorage();
const conversationState = new ConversationState(memoryStorage);

// Create the conversationIdFactory
const conversationIdFactory = new SkillConversationIdFactory(new MemoryStorage());

// Create the skill client.
const skillClient = botFrameworkAuthentication.createBotFrameworkClient();

// Create the bot that will handle incoming messages.
const bot = new TeamsBot(conversationState, conversationIdFactory, skillClient);

// Create HTTP server.
const server = restify.createServer();
server.use(restify.plugins.bodyParser());
server.listen(process.env.port || process.env.PORT || 3978, () => {
  console.log(`\nBot Started, ${server.name} listening to ${server.url}`);
});

// Listen for incoming requests.
server.post("/api/messages", async (req, res) => {
  await adapter.process(req, res, async (context) => {
    //await bot.run(context);
   await app.run(context);
  });
});
const handler = new CloudSkillHandler(adapter, (context) => bot.run(context), conversationIdFactory, botFrameworkAuthentication);
const skillEndpoint = new ChannelServiceRoutes(handler);
skillEndpoint.register(server, '/api/skills');