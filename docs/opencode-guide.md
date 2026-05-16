# OpenCode Setup and Usage Guide

This guide covers how to run OpenCode in the OrbitJob workspace and how to switch between different AI models.

## Initial Setup

Before launching OpenCode, you must provide your OpenRouter API key.
1. Open the `.env` file in the root directory (`Orbitjob/.env`).
2. Replace `your_openrouter_api_key_here` with your actual OpenRouter API key (get one at [https://openrouter.ai/keys](https://openrouter.ai/keys)).

## Launching OpenCode

To start an OpenCode session, use the following command from the root `Orbitjob` directory:
```bash
npm run opencode
```
*(Note: If you run into PowerShell execution policies blocking `npm run`, you can use `cmd /c npm run opencode` as an alternative.)*

## Switching Models

We have configured two free models from OpenRouter for you to use:
- **DeepSeek** (`deepseek/deepseek-r1:free`) - **Default**
- **Qwen** (`qwen/qwen-2.5-coder:free`)

### How to Switch Models
If you want to use the Qwen model instead of DeepSeek, you have two options:

**Option 1: Temporarily via Command Line**
You can specify the model directly when launching OpenCode:
```bash
npm run opencode -- --model qwen/qwen-2.5-coder:free
```

**Option 2: Permanently via `opencode.json`**
You can change the default model in your `opencode.json` file.
Open `opencode.json` and change the `defaultModel` field:
```json
{
  "provider": "openrouter",
  "models": [
    "deepseek/deepseek-r1:free",
    "qwen/qwen-2.5-coder:free"
  ],
  "defaultModel": "qwen/qwen-2.5-coder:free"
}
```
