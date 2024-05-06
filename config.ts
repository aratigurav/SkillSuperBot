const config = {
  botId: process.env.BOT_ID,
  botPassword: process.env.BOT_PASSWORD,
  openAIKey: process.env.SECRET_OPENAI_API_KEY,
  azureOpenAIKey: process.env.SECRET_AZURE_OPENAI_API_KEY,
  apiversion: "2022-12-01",
  endpoint: "https://devdocs.openai.azure.com/",
  defaultmodel:"gpt-35-turbo"
};

export default config;
