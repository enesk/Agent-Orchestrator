import { z } from 'zod'

/**
 * Contract-First: Jeder IPC-Kanal ist hier genau einmal beschrieben — Request und Response
 * als Zod-Schema. Main-Handler und Renderer werden gegen diesen Vertrag gebaut und können
 * deshalb unabhängig voneinander entstehen.
 */

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

export const jsonObjectSchema = z.record(z.string(), z.unknown())

export const okSchema = z.object({ ok: z.literal(true) })

export const agentRoleSchema = z.enum(['worker', 'planner', 'pm', 'reviewer'])
export const agentEffortSchema = z.enum(['low', 'medium', 'high', 'xhigh', 'max'])
export const messageRoleSchema = z.enum(['user', 'agent', 'system'])
export const messageStatusSchema = z.enum(['streaming', 'done', 'error', 'stopped'])
export const ticketStatusSchema = z.enum(['open', 'in_progress', 'done'])
export const ticketCategorySchema = z.enum([
  'bug',
  'feature',
  'task',
  'improvement',
  'documentation',
  'question',
  'epic',
])
export const ticketAuthorTypeSchema = z.enum(['user', 'agent'])
export const memorySourceSchema = z.enum(['agent', 'user'])
export const goalModeSchema = z.enum(['ai', 'selected'])
export const goalStatusSchema = z.enum([
  'pending',
  'planning',
  'in_progress',
  'reviewing',
  'done',
  'cancelled',
  'failed',
])
export const goalLogStatusSchema = z.enum(['running', 'success', 'failed'])
export const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error'])
export const agentActivitySchema = z.enum(['idle', 'thinking', 'writing', 'tool', 'error'])
export const changeActionSchema = z.enum(['created', 'updated', 'removed'])

// ---------------------------------------------------------------------------
// Entitäten
// ---------------------------------------------------------------------------

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  path: z.string().nullable(),
  metadata: jsonObjectSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})

/**
 * Ein gespeichertes Projekt plus Hinweis, falls der hinterlegte Pfad nicht existiert oder
 * kein Verzeichnis ist. Gespeichert wird trotzdem — die UI zeigt den Hinweis nur an.
 */
export const projectSaveResultSchema = projectSchema.extend({
  pathWarning: z.string().nullable(),
})

export const agentSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string().nullable(),
  mentionKey: z.string(),
  role: agentRoleSchema,
  systemPrompt: z.string(),
  model: z.string(),
  effort: agentEffortSchema,
  color: z.string(),
  avatar: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const projectAgentSchema = agentSchema.extend({
  projectId: z.string().nullable(),
  sortOrder: z.number(),
  stopped: z.boolean(),
})

export const messageAttachmentSchema = z.object({
  id: z.string(),
  messageId: z.string().nullable(),
  ticketId: z.string().nullable(),
  fileName: z.string(),
  mimeType: z.string().nullable(),
  relativePath: z.string(),
  size: z.number(),
  createdAt: z.string(),
})

export const chatMessageSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  role: messageRoleSchema,
  agentId: z.string().nullable(),
  content: z.string(),
  thinking: z.string().nullable(),
  mentions: z.array(z.string()),
  replyToId: z.string().nullable(),
  status: messageStatusSchema,
  errorCode: z.string().nullable(),
  metadata: jsonObjectSchema,
  createdAt: z.string(),
  attachments: z.array(messageAttachmentSchema),
})

export const ticketSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  number: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  status: ticketStatusSchema,
  category: ticketCategorySchema,
  assignedAgentId: z.string().nullable(),
  goalId: z.number().nullable(),
  externalId: z.string().nullable(),
  epicId: z.string().nullable(),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const ticketCommentSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  authorType: ticketAuthorTypeSchema,
  agentId: z.string().nullable(),
  content: z.string(),
  createdAt: z.string(),
})

export const ticketDetailSchema = ticketSchema.extend({
  comments: z.array(ticketCommentSchema),
  dependencies: z.array(z.string()),
  dependents: z.array(z.string()),
  attachments: z.array(messageAttachmentSchema),
})

export const projectDocumentSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  content: z.string(),
  createdByAgentId: z.string().nullable(),
  updatedByAgentId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const agentMemorySchema = z.object({
  id: z.number(),
  agentId: z.string(),
  projectId: z.string().nullable(),
  key: z.string(),
  value: z.string(),
  importance: z.number().int().min(1).max(3),
  source: memorySourceSchema,
  accessCount: z.number(),
  lastAccessedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const goalSchema = z.object({
  id: z.number(),
  projectId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  mode: goalModeSchema,
  status: goalStatusSchema,
  phase: z.string().nullable(),
  specDocumentId: z.string().nullable(),
  selectedAgentIds: z.array(z.string()),
  checkpoint: jsonObjectSchema.nullable(),
  retryCount: z.number(),
  errorType: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
})

export const goalLogEntrySchema = z.object({
  id: z.number(),
  goalId: z.number(),
  phase: z.string().nullable(),
  agentId: z.string().nullable(),
  ticketId: z.string().nullable(),
  message: z.string(),
  status: goalLogStatusSchema,
  createdAt: z.string(),
})

export const claudeStatusSchema = z.object({
  available: z.boolean(),
  path: z.string().nullable(),
  version: z.string().nullable(),
  error: z.string().nullable(),
  checkedAt: z.string(),
})

export const appSettingsSchema = z.object({
  claudePath: z.string().nullable(),
  minimizeToTray: z.boolean(),
  notificationsEnabled: z.boolean(),
})

export const appInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  electronVersion: z.string(),
  platform: z.string(),
  databasePath: z.string(),
  databaseDirectory: z.string(),
})

export const logEntrySchema = z.object({
  id: z.string(),
  level: logLevelSchema,
  scope: z.string(),
  message: z.string(),
  data: jsonObjectSchema.nullable(),
  timestamp: z.string(),
})

export const agentStatusUpdateSchema = z.object({
  projectId: z.string(),
  agentId: z.string(),
  activity: agentActivitySchema,
  detail: z.string().nullable(),
  messageId: z.string().nullable(),
})

// ---------------------------------------------------------------------------
// Request-Schemas
// ---------------------------------------------------------------------------

const idSchema = z.object({ id: z.string() })
const numericIdSchema = z.object({ id: z.number().int() })

export const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  path: z.string().nullable().optional(),
  metadata: jsonObjectSchema.optional(),
})

export const updateProjectSchema = z.object({
  id: z.string(),
  patch: z.object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    path: z.string().nullable().optional(),
    metadata: jsonObjectSchema.optional(),
  }),
})

export const createAgentSchema = z.object({
  name: z.string().min(1),
  title: z.string().nullable().optional(),
  mentionKey: z.string().min(1).optional(),
  role: agentRoleSchema,
  systemPrompt: z.string().default(''),
  model: z.string().optional(),
  effort: agentEffortSchema.optional(),
  color: z.string().optional(),
  avatar: z.string().nullable().optional(),
})

export const updateAgentSchema = z.object({
  id: z.string(),
  patch: z.object({
    name: z.string().min(1).optional(),
    title: z.string().nullable().optional(),
    mentionKey: z.string().min(1).optional(),
    role: agentRoleSchema.optional(),
    systemPrompt: z.string().optional(),
    model: z.string().optional(),
    effort: agentEffortSchema.optional(),
    color: z.string().optional(),
    avatar: z.string().nullable().optional(),
  }),
})

export const createTicketSchema = z.object({
  projectId: z.string(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: ticketStatusSchema.optional(),
  category: ticketCategorySchema.optional(),
  assignedAgentId: z.string().nullable().optional(),
  goalId: z.number().int().nullable().optional(),
  externalId: z.string().nullable().optional(),
  epicId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
})

export const updateTicketSchema = z.object({
  id: z.string(),
  patch: z.object({
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    status: ticketStatusSchema.optional(),
    category: ticketCategorySchema.optional(),
    assignedAgentId: z.string().nullable().optional(),
    goalId: z.number().int().nullable().optional(),
    externalId: z.string().nullable().optional(),
    epicId: z.string().nullable().optional(),
    sortOrder: z.number().int().optional(),
  }),
})

/** Struktur eines importierten Tickets — bewusst tolerant, damit fremde Exporte passen. */
export const ticketImportItemSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: ticketStatusSchema.optional(),
  category: ticketCategorySchema.optional(),
  externalId: z.string().nullable().optional(),
  assignedAgentId: z.string().nullable().optional(),
  dependsOn: z.array(z.string()).optional(),
})

export const createDocumentSchema = z.object({
  projectId: z.string(),
  title: z.string().min(1),
  content: z.string().default(''),
  createdByAgentId: z.string().nullable().optional(),
})

export const updateDocumentSchema = z.object({
  id: z.string(),
  patch: z.object({
    title: z.string().min(1).optional(),
    content: z.string().optional(),
    updatedByAgentId: z.string().nullable().optional(),
  }),
})

export const saveMemorySchema = z.object({
  agentId: z.string(),
  projectId: z.string().nullable().optional(),
  key: z.string().min(1),
  value: z.string(),
  importance: z.number().int().min(1).max(3).optional(),
  source: memorySourceSchema.optional(),
})

// ---------------------------------------------------------------------------
// Der Vertrag
// ---------------------------------------------------------------------------

export interface IpcChannelDefinition {
  request: z.ZodType
  response: z.ZodType
}

export const ipcContract = {
  projects: {
    list: { request: z.void(), response: z.array(projectSchema) },
    get: { request: idSchema, response: projectSchema.nullable() },
    create: { request: createProjectSchema, response: projectSaveResultSchema },
    update: { request: updateProjectSchema, response: projectSaveResultSchema },
    remove: { request: idSchema, response: okSchema },
    pickPath: { request: z.void(), response: z.object({ path: z.string().nullable() }) },
  },
  agents: {
    list: {
      request: z.object({ projectId: z.string().nullable().optional() }),
      response: z.array(projectAgentSchema),
    },
    create: { request: createAgentSchema, response: agentSchema },
    update: { request: updateAgentSchema, response: agentSchema },
    remove: { request: idSchema, response: okSchema },
    addToProject: {
      request: z.object({
        projectId: z.string(),
        agentId: z.string(),
        sortOrder: z.number().int().optional(),
      }),
      response: projectAgentSchema,
    },
    removeFromProject: {
      request: z.object({ projectId: z.string(), agentId: z.string() }),
      response: okSchema,
    },
    setStopped: {
      request: z.object({
        projectId: z.string(),
        agentId: z.string(),
        stopped: z.boolean(),
      }),
      response: projectAgentSchema,
    },
    generatePrompt: {
      request: z.object({
        description: z.string().min(1),
        name: z.string().optional(),
        role: agentRoleSchema.optional(),
      }),
      response: z.object({ systemPrompt: z.string(), title: z.string().nullable() }),
    },
  },
  chat: {
    send: {
      request: z.object({
        projectId: z.string(),
        content: z.string(),
        mentions: z.array(z.string()).optional(),
        replyToId: z.string().nullable().optional(),
        attachmentIds: z.array(z.string()).optional(),
      }),
      response: chatMessageSchema,
    },
    history: {
      request: z.object({
        projectId: z.string(),
        limit: z.number().int().positive().optional(),
        before: z.string().nullable().optional(),
      }),
      response: z.array(chatMessageSchema),
    },
    deleteMessage: { request: idSchema, response: okSchema },
    retryMessage: { request: idSchema, response: chatMessageSchema },
    stopMessage: { request: idSchema, response: okSchema },
    thread: {
      request: z.object({ messageId: z.string() }),
      response: z.array(chatMessageSchema),
    },
    saveAttachment: {
      request: z.object({
        fileName: z.string().min(1),
        mimeType: z.string().nullable().optional(),
        dataBase64: z.string(),
        messageId: z.string().nullable().optional(),
        ticketId: z.string().nullable().optional(),
      }),
      response: messageAttachmentSchema,
    },
  },
  tickets: {
    list: {
      request: z.object({
        projectId: z.string(),
        status: ticketStatusSchema.optional(),
        category: ticketCategorySchema.optional(),
        assignedAgentId: z.string().nullable().optional(),
        goalId: z.number().int().nullable().optional(),
      }),
      response: z.array(ticketSchema),
    },
    get: { request: idSchema, response: ticketDetailSchema.nullable() },
    create: { request: createTicketSchema, response: ticketSchema },
    update: { request: updateTicketSchema, response: ticketSchema },
    remove: { request: idSchema, response: okSchema },
    addComment: {
      request: z.object({
        ticketId: z.string(),
        content: z.string().min(1),
        authorType: ticketAuthorTypeSchema,
        agentId: z.string().nullable().optional(),
      }),
      response: ticketCommentSchema,
    },
    setDependencies: {
      request: z.object({ ticketId: z.string(), dependsOn: z.array(z.string()) }),
      response: ticketDetailSchema,
    },
    importJson: {
      request: z.object({ projectId: z.string(), json: z.string() }),
      response: z.object({
        created: z.number(),
        updated: z.number(),
        tickets: z.array(ticketSchema),
        /** Tolerierte Ungereimtheiten der Datei — der Import läuft trotzdem durch. */
        warnings: z.array(z.string()),
      }),
    },
  },
  documents: {
    list: {
      request: z.object({ projectId: z.string() }),
      response: z.array(projectDocumentSchema),
    },
    get: { request: idSchema, response: projectDocumentSchema.nullable() },
    create: { request: createDocumentSchema, response: projectDocumentSchema },
    update: { request: updateDocumentSchema, response: projectDocumentSchema },
    remove: { request: idSchema, response: okSchema },
  },
  memory: {
    list: {
      request: z.object({
        agentId: z.string().optional(),
        projectId: z.string().nullable().optional(),
      }),
      response: z.array(agentMemorySchema),
    },
    save: { request: saveMemorySchema, response: agentMemorySchema },
    remove: { request: numericIdSchema, response: okSchema },
    clear: {
      request: z.object({
        agentId: z.string().optional(),
        projectId: z.string().nullable().optional(),
      }),
      response: z.object({ removed: z.number() }),
    },
  },
  goals: {
    list: { request: z.object({ projectId: z.string() }), response: z.array(goalSchema) },
    get: { request: numericIdSchema, response: goalSchema.nullable() },
    startFromDescription: {
      request: z.object({
        projectId: z.string(),
        description: z.string().min(1),
        title: z.string().optional(),
        selectedAgentIds: z.array(z.string()).optional(),
      }),
      response: goalSchema,
    },
    startFromTickets: {
      request: z.object({
        projectId: z.string(),
        ticketIds: z.array(z.string()).min(1),
        title: z.string().optional(),
        selectedAgentIds: z.array(z.string()).optional(),
      }),
      response: goalSchema,
    },
    cancel: { request: numericIdSchema, response: goalSchema },
    retry: { request: numericIdSchema, response: goalSchema },
    log: {
      request: z.object({
        goalId: z.number().int(),
        limit: z.number().int().positive().optional(),
      }),
      response: z.array(goalLogEntrySchema),
    },
  },
  settings: {
    get: { request: z.void(), response: appSettingsSchema },
    save: { request: appSettingsSchema.partial(), response: appSettingsSchema },
    pickClaudePath: { request: z.void(), response: z.object({ path: z.string().nullable() }) },
  },
  app: {
    info: { request: z.void(), response: appInfoSchema },
    /** Öffnet den Ordner der Datenbank im Dateimanager. */
    openDatabaseFolder: { request: z.void(), response: okSchema },
    /** Zeigt die Datenbankdatei selbst markiert im Dateimanager. */
    showDatabaseFile: { request: z.void(), response: okSchema },
  },
  claude: {
    status: { request: z.void(), response: claudeStatusSchema },
    detect: {
      request: z.object({ path: z.string().nullable().optional() }),
      response: claudeStatusSchema,
    },
  },
  logs: {
    recent: {
      request: z.object({ limit: z.number().int().positive().optional() }),
      response: z.array(logEntrySchema),
    },
  },
} as const satisfies Record<string, Record<string, IpcChannelDefinition>>

// ---------------------------------------------------------------------------
// Events (main → renderer)
// ---------------------------------------------------------------------------

export const ipcEvents = {
  'chat.message': z.object({
    projectId: z.string(),
    message: chatMessageSchema,
    /** Neu hinzugekommener Text, damit der Renderer nicht neu rendern muss. */
    delta: z.string().nullable(),
  }),
  'chat.agentStatus': agentStatusUpdateSchema,
  'ticket.changed': z.object({
    projectId: z.string(),
    ticketId: z.string(),
    action: changeActionSchema,
  }),
  'document.changed': z.object({
    projectId: z.string(),
    documentId: z.string(),
    action: changeActionSchema,
  }),
  'agent.changed': z.object({
    agentId: z.string().nullable(),
    projectId: z.string().nullable(),
    action: changeActionSchema,
  }),
  'goal.changed': z.object({
    projectId: z.string(),
    goalId: z.number(),
    goal: goalSchema.nullable(),
    action: changeActionSchema,
  }),
  'goal.log': goalLogEntrySchema,
  'claude.status': claudeStatusSchema,
  'log.entry': logEntrySchema,
} as const satisfies Record<string, z.ZodType>

// ---------------------------------------------------------------------------
// Abgeleitete Typen
// ---------------------------------------------------------------------------

export type IpcContract = typeof ipcContract
export type IpcDomain = keyof IpcContract
export type IpcMethod<D extends IpcDomain> = keyof IpcContract[D]

type SchemaOf<T> = T extends z.ZodType ? T : never

/** Der Typ, den der Aufrufer schickt (mit `.default()`-Feldern als optional). */
export type IpcRequest<D extends IpcDomain, M extends IpcMethod<D>> = z.input<
  SchemaOf<IpcContract[D][M] extends { request: infer R } ? R : never>
>

/** Der geparste Request, wie ihn der Main-Handler bekommt. */
export type IpcParsedRequest<D extends IpcDomain, M extends IpcMethod<D>> = z.output<
  SchemaOf<IpcContract[D][M] extends { request: infer R } ? R : never>
>

/** Der geparste Typ, den der Aufrufer zurückbekommt. */
export type IpcResponse<D extends IpcDomain, M extends IpcMethod<D>> = z.output<
  SchemaOf<IpcContract[D][M] extends { response: infer R } ? R : never>
>

export type IpcEvents = typeof ipcEvents
export type IpcEventName = keyof IpcEvents
export type IpcEventPayload<E extends IpcEventName> = z.output<IpcEvents[E]>

export type IpcApi = {
  [D in IpcDomain]: {
    [M in IpcMethod<D>]: IpcRequest<D, M> extends void
      ? () => Promise<IpcResponse<D, M>>
      : (input: IpcRequest<D, M>) => Promise<IpcResponse<D, M>>
  }
} & {
  on<E extends IpcEventName>(
    event: E,
    listener: (payload: IpcEventPayload<E>) => void,
  ): () => void
}

/** Kanalname, wie er über `ipcRenderer.invoke` läuft. */
export function ipcChannelName(domain: string, method: string): string {
  return `${domain}:${method}`
}

export const IPC_EVENT_CHANNEL = 'app:event'

export const ipcDomains = Object.keys(ipcContract) as IpcDomain[]

export const ipcEventNames = Object.keys(ipcEvents) as IpcEventName[]
