import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { buildApp } from './app.js';
import { clearLlmLogOnStartup, getLlmLogPathInfo } from './lib/llm/llmRequestLogger.js';

const PORT = Number(process.env.PORT) || 3001;

async function main() {
  const app = await buildApp();

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Server listening on http://localhost:${PORT}`);

  if (process.env.GOOGLE_REDIRECT_URI) {
    console.log(`Gmail OAuth redirect_uri: ${process.env.GOOGLE_REDIRECT_URI}`);
  }

  const llmLog = getLlmLogPathInfo();
  if (llmLog) {
    clearLlmLogOnStartup();
    const fileUrl = pathToFileURL(llmLog.path).href;
    console.log(`LLM 请求日志: ${fileUrl}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
