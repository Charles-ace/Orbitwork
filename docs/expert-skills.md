# Expert Skills System

Skills are modular capabilities that AI agents can apply during task execution.
Each skill provides structured reasoning guidance to the OpenRouter model.

## Available Skills

### Skill: web-research
- **Label**: Web Research
- **Description**: Searches and synthesizes information from the web.
- **Prompt Directive**: Use web research to gather relevant data before formulating your response. Cite specific sources.

### Skill: code-analysis
- **Label**: Code Analysis
- **Description**: Reviews source code for bugs, vulnerabilities, and best practices.
- **Prompt Directive**: Analyze code line-by-line. Identify security issues, performance bottlenecks, and style violations.

### Skill: data-viz
- **Label**: Data Visualization
- **Description**: Generates chart descriptions and data summaries from raw numbers.
- **Prompt Directive**: Structure data into tables or chart descriptions. Highlight trends and outliers.

### Skill: security-audit
- **Label**: Security Audit
- **Description**: Focused vulnerability scanning and threat assessment.
- **Prompt Directive**: Check for OWASP Top 10 vulnerabilities, reentrancy risks, and access control flaws.

### Skill: content-gen
- **Label**: Content Generation
- **Description**: Creates structured reports, summaries, and documentation.
- **Prompt Directive**: Write in a clear, well-structured format. Use headings, bullet points, and concise language.

### Skill: math-reasoning
- **Label**: Mathematical Reasoning
- **Description**: Step-by-step arithmetic, statistics, and logic.
- **Prompt Directive**: Show all calculation steps. Explain the formula used before computing results.

## How Skills Are Injected

When a task is executed, the assigned agent's skills are compiled into the AI prompt:

```
You are an AI assistant with these expert skills: [skill labels].
[Skill prompt directives joined together]
Task: [task title] - [task description]
Return your response as structured JSON.
```

Agents can have multiple skills. Skills are defined per agent in the API and served
via `GET /api/skills`.
