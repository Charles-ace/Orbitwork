# OpenCode Setup Guide for Orbitwork

OpenCode is a terminal-native AI coding agent configured to work with OpenRouter's free models for this project.

## 🚀 Getting Started

### 1. Configure your API Key
Open the root `.env` file and replace `your_openrouter_api_key_here` with your actual OpenRouter API key.
- **Link:** [OpenRouter API Keys](https://openrouter.ai/keys)

### 2. Launching OpenCode
To start the OpenCode TUI (Terminal User Interface), run:
```bash
npm run opencode
```
Or, if you have it installed globally:
```bash
opencode
```

### 3. Connecting to OpenRouter
Once inside OpenCode, if the connection isn't automatic, use:
```text
/connect
```
Then select **OpenRouter** as the provider.

## 🛠️ Switching Models
You can switch between the pre-configured free models using the `/model` command inside the TUI:

- **DeepSeek R1 (Free):**
  ```text
  /model deepseek/deepseek-r1:free
  ```
- **Qwen 2.5 Coder (Free):**
  ```text
  /model qwen/qwen-2.5-coder:free
  ```

## 🤖 Using OpenCode with Antigravity
OpenCode and Antigravity can work together to accelerate Orbitwork development:

1. **Antigravity (This Chat):** Use for high-level architectural planning, complex multi-file refactoring, and project coordination.
2. **OpenCode (Terminal):** Use for rapid iterations, local file modifications, and "in-the-flow" coding tasks directly in your terminal.

### Example Workflow:
1. Ask **Antigravity** to design a new feature for the Orbitwork Agent Layer.
2. Once the plan is approved, use **OpenCode** in your terminal to implement the individual components while keeping the terminal open for immediate feedback.

## 📁 File Structure
The following files were created for this setup:
- `package.json`: Root package file with OpenCode dependency.
- `opencode.json`: Main configuration for OpenRouter and models.
- `.env`: Storage for your `OPENROUTER_API_KEY`.
- `node_modules/`: Contains the local OpenCode installation.
