---
name: adonis-mcp
description: Guide for developing custom Model Context Protocol (MCP) servers using `@jrmc/adonis-mcp` in AdonisJS v7. Covers tools, resources, prompts, completions, routing, security (CSRF/Bouncer), and testing.
---

# AdonisJS MCP Development Guide (AdonisJS v7)

This skill provides comprehensive instructions, patterns, and code examples for building Model Context Protocol (MCP) servers integrated with an AdonisJS v7 application using the official-community `@jrmc/adonis-mcp` package.

---

## 1. Directory Structure & Commands

By default, all MCP-related components are organized in `app/mcp/`. You can customize this directory in `adonisrc.ts` under the `directories` key:

```typescript
// adonisrc.ts
directories: {
  mcp: 'app/mcp', // Default directory path
}
```

### CLI Generator Commands

Use Ace to scaffold new MCP components:

```bash
# Create a new Tool
node ace make:mcp-tool my_tool

# Create a new Resource
node ace make:mcp-resource my_resource

# Create a new Prompt
node ace make:mcp-prompt my_prompt
```

### Inspector Tool

The MCP Inspector provides an interactive interface for debugging tools, resources, and prompts during development.

```bash
# Open MCP Inspector using HTTP transport (default)
node ace mcp:inspector

# Open MCP Inspector using stdio transport
node ace mcp:inspector stdio
```

---

## 2. Tools

Tools are type-safe, executable actions that AI models can trigger. They require a JSON Schema mapping the arguments they accept.

### Example Tool Implementation

```typescript
import type { ToolContext } from '@jrmc/adonis-mcp/types/context'
import type { BaseSchema } from '@jrmc/adonis-mcp/types/method'
import { Tool } from '@jrmc/adonis-mcp'
import { isReadOnly, isIdempotent } from '@jrmc/adonis-mcp/tool_annotations'

type Schema = BaseSchema<{
  userId: { type: 'string' }
  limit: { type: 'number' }
}>

@isReadOnly()
@isIdempotent()
export default class ListUserLogsTool extends Tool<Schema> {
  name = 'list_user_logs'
  title = 'List User Logs'
  description = 'Retrieve audit and activity logs for a specific user ID'

  async handle({ args, response, auth }: ToolContext<Schema>) {
    // Access authenticated user or arguments
    const requester = auth?.user
    if (!requester) {
      return response.error('Requester must be authenticated')
    }

    // Logic: Fetch logs from a service or database
    const logs = [{ id: '1', action: 'login', timestamp: new Date().toISOString() }]

    return response.structured({
      userId: args.userId,
      count: logs.length,
      logs,
    })
  }

  schema() {
    return {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'The unique UUID of the user to fetch logs for',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of log entries to retrieve (default: 10)',
        },
      },
      required: ['userId'],
    } as Schema
  }
}
```

### Defining JSON Schemas

You can define your tool schemas using:

1. **JSON Schema Object**: The standard JSON Schema specification (as shown above).
2. **Zod Validation**: Use `zod-to-json-schema` to export to a compatible JSON schema.
3. **VineJS (Recommended)**: AdonisJS's native validation engine.

#### VineJS Schema Example

```typescript
import vine from '@vinejs/vine'

const listLogsSchema = vine.object({
  userId: vine.string().meta({
    description: 'The unique UUID of the target user',
  }),
  limit: vine.number().optional().meta({
    description: 'Maximum number of items to return',
  }),
})

schema() {
  return vine.create(listLogsSchema).toJSONSchema() as Schema
}
```

---

## 3. Resources

Resources expose raw application data (text or binary content) to the AI model. They are identified by URI templates.

### Dynamic Resource with URI Templates

You can use dynamic paths (RFC 6570 syntax) to parameterize resource fetches.

```typescript
import type { ResourceContext } from '@jrmc/adonis-mcp/types/context'
import { Resource } from '@jrmc/adonis-mcp'
import { priority, audience } from '@jrmc/adonis-mcp/annotations'
import Role from '@jrmc/adonis-mcp/enums/role'

type Args = {
  projectId: string
}

@priority(0.8)
@audience([Role.USER, Role.ASSISTANT])
export default class ProjectDetailsResource extends Resource<Args> {
  name = 'project_details'
  uri = 'file:///projects/{projectId}/summary.txt'
  mimeType = 'text/plain'
  title = 'Project Details Summary'
  description = 'Detailed text summary of project parameters and configuration'

  async handle({ args, response }: ResourceContext<Args>) {
    const projectId = args.projectId

    // Logic: Fetch project details from service/DB
    const projectSummary = `Summary for project ID: ${projectId}\nStatus: Active\nTeam: Core`

    this.size = projectSummary.length
    return response.text(projectSummary)
  }
}
```

---

## 4. Prompts & Completions

Prompts are reusable, structured templates that guide LLM interactions. They support **Completions** to help users fill out arguments interactively in compatible IDE environments (Cursor, Windsurf, etc.).

### Example Prompt with Completions

```typescript
import type { PromptContext, CompleteContext } from '@jrmc/adonis-mcp/types/context'
import type { BaseSchema } from '@jrmc/adonis-mcp/types/method'
import { Prompt } from '@jrmc/adonis-mcp'

type Schema = BaseSchema<{
  category: { type: 'string' }
  issue: { type: 'string' }
}>

export default class CodeReviewPrompt extends Prompt<Schema> {
  name = 'help_review_issue'
  title = 'Help Review Issue'
  description = 'Scaffolds an instruction to review a backend or frontend issue.'

  async handle({ args, response }: PromptContext<Schema>) {
    return [
      response.text(`Please review this ${args.category} issue.`),
      response.text(`The issue description is:\n\n${args.issue}`),
    ]
  }

  // Interactive completion suggestions for parameters
  async complete({ args, response }: CompleteContext<Schema>) {
    if (args?.category !== undefined) {
      return response.complete({
        values: ['auth', 'database', 'routing', 'validation', 'caching'],
      })
    }
    return response.complete({ values: [] })
  }

  schema() {
    return {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'The backend category the issue belongs to',
        },
        issue: {
          type: 'string',
          description: 'Detailed description of the issue',
        },
      },
      required: ['category', 'issue'],
    } as Schema
  }
}
```

---

## 5. Security & Authentication

### CSRF Exceptions

MCP requests usually do not carry standard CSRF cookies. If your AdonisJS application uses `@adonisjs/shield`, you **must** exempt the MCP route from CSRF checking in `config/shield.ts`:

```typescript
// config/shield.ts
export const shieldConfig = defineConfig({
  csrf: {
    enabled: true,
    exceptRoutes: [
      '/mcp', // Exclude default MCP route
    ],
  },
})
```

### Routing & Middleware

Register your MCP routes in `start/routes.ts` and apply relevant authentication middleware to protect the endpoint:

```typescript
// start/routes.ts
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

// Automatically registers routes to host your tools, prompts, and resources
router.mcp().use(middleware.auth())
```

### Authorization (Bouncer & Auth)

Add types to your custom `app/middleware/mcp_middleware.ts` to expose `auth` and `bouncer` inside the `ToolContext` or `ResourceContext`:

```typescript
// app/middleware/mcp_middleware.ts
import type { HttpContext } from '@adonisjs/core/http'
import type McpBouncer from '@jrmc/adonis-mcp/bouncer'
import type { abilities } from '#abilities/main'
import type { policies } from '#policies/main'

declare module '@jrmc/adonis-mcp/types/context' {
  export interface McpContext {
    auth: {
      user?: HttpContext['auth']['user']
    }
    bouncer: McpBouncer<
      Exclude<HttpContext['auth']['user'], undefined>,
      typeof abilities,
      typeof policies
    >
  }
}
```

This lets you enforce access controls in your handlers seamlessly:

```typescript
async handle({ bouncer, response }: ToolContext<Schema>) {
  // Authorize using standard AdonisJS Bouncer policies/abilities
  await bouncer.authorize('viewSecretData')

  return response.text('Sensitive backend metrics...')
}
```

---

## 6. Best Practices

1. **Leverage Structured Outputs**: Prefer `response.structured(object)` for tools so that callers receive fully formatted JSON rather than needing to parse a string representation of JSON.
2. **Metadata Enrichment**: Use `.withMeta({ ... })` on responses to attach debug information or metrics (e.g., query speeds, database sources).
3. **Idempotency Annotations**: Use `@isReadOnly()` and `@isIdempotent()` decorators to give AI clients confidence to call tools repeatedly without side-effects.
4. **Use Appwrite Correctly**: Inside MCP tool handlers, utilize the `TablesDB` client singleton to query Appwrite collections securely, utilizing standard exception handlers (`AppwriteException`) to capture error conditions.
