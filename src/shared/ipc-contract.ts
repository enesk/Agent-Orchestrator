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
export const mcpTransportSchema = z.enum(['http', 'sse', 'stdio'])
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
  skillIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const skillFileSchema = z.object({
  id: z.string(),
  relPath: z.string(),
  size: z.number(),
  createdAt: z.string(),
})

export const skillSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  content: z.string(),
  files: z.array(skillFileSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const skillImportPreviewSchema = z.object({
  token: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  contentLength: z.number(),
  files: z.array(z.object({ relPath: z.string(), size: z.number() })),
})

/**
 * Ein externer MCP-Server. Header- und Umgebungswerte fehlen hier mit Absicht: sie können
 * Zugangsdaten enthalten, liegen verschlüsselt in der Datenbank und gehen nie über IPC zurück.
 */
export const mcpServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  transport: mcpTransportSchema,
  url: z.string().nullable(),
  command: z.string().nullable(),
  args: z.array(z.string()),
  headerKeys: z.array(z.string()),
  envKeys: z.array(z.string()),
  description: z.string(),
  toolCount: z.number().nullable(),
  checkedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const mcpProbeResultSchema = z.object({
  serverName: z.string().nullable(),
  serverVersion: z.string().nullable(),
  toolNames: z.array(z.string()),
  instructionsLength: z.number().nullable(),
  durationMs: z.number(),
})

/**
 * Ein Schlüssel-Wert-Paar für Header oder Umgebung. `value: null` heißt „unverändert" — die
 * Oberfläche kennt gespeicherte Werte nicht und schickt nur geänderte mit. Schlüssel, die
 * fehlen, werden gelöscht.
 */
export const mcpSecretPairSchema = z.object({
  key: z.string().min(1),
  value: z.string().nullable(),
})

export const createMcpServerSchema = z.object({
  name: z.string().min(1),
  transport: mcpTransportSchema,
  url: z.string().nullable().optional(),
  command: z.string().nullable().optional(),
  args: z.array(z.string()).optional(),
  headers: z.array(mcpSecretPairSchema).optional(),
  env: z.array(mcpSecretPairSchema).optional(),
  description: z.string().optional(),
})

export const updateMcpServerSchema = z.object({
  id: z.string(),
  patch: z.object({
    name: z.string().min(1).optional(),
    transport: mcpTransportSchema.optional(),
    url: z.string().nullable().optional(),
    command: z.string().nullable().optional(),
    args: z.array(z.string()).optional(),
    headers: z.array(mcpSecretPairSchema).optional(),
    env: z.array(mcpSecretPairSchema).optional(),
    description: z.string().optional(),
  }),
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
  guidelinesDocumentId: z.string().nullable(),
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
  language: z.enum(['de', 'en', 'tr']),
  remoteEnabled: z.boolean(),
  remotePort: z.number().int().min(1).max(65535),
  webuiPath: z.string().nullable(),
})

export const remoteStatusSchema = z.object({
  enabled: z.boolean(),
  running: z.boolean(),
  port: z.number().int().nullable(),
  addresses: z.array(z.string()),
  clientCount: z.number().int(),
  staticRoot: z.string(),
  contractVersion: z.string(),
  error: z.string().nullable(),
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
  skillIds: z.array(z.string()).optional(),
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
    skillIds: z.array(z.string()).optional(),
  }),
})

export const createSkillSchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().default(''),
  content: z.string().default(''),
})

export const updateSkillSchema = z.object({
  id: z.string(),
  patch: z.object({
    name: z.string().min(1).optional(),
    slug: z.string().min(1).optional(),
    description: z.string().optional(),
    content: z.string().optional(),
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
    guidelinesDocumentId: z.string().nullable().optional(),
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
    /** Wie viele Nachrichten ein `clearHistory` mit denselben Angaben treffen würde. */
    countHistory: {
      request: z.object({
        projectId: z.string(),
        olderThanDays: z.number().int().positive().optional(),
      }),
      response: z.object({ count: z.number() }),
    },
    /** Ohne `olderThanDays` verschwindet der gesamte Verlauf des Projekts. */
    clearHistory: {
      request: z.object({
        projectId: z.string(),
        olderThanDays: z.number().int().positive().optional(),
      }),
      response: z.object({ deleted: z.number() }),
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
    /** Sammellöschen in einer Transaktion — unbekannte IDs werden übersprungen. */
    removeMany: {
      request: z.object({ ids: z.array(z.string()) }),
      response: z.object({ removed: z.number().int() }),
    },
    addComment: {
      request: z.object({
        ticketId: z.string(),
        content: z.string().min(1),
        authorType: ticketAuthorTypeSchema,
        agentId: z.string().nullable().optional(),
      }),
      response: ticketCommentSchema,
    },
    /**
     * Löscht einen einzelnen Kommentar. Bewusst nur für den Nutzer — es gibt kein
     * MCP-Werkzeug dazu, damit ein Agent seine eigenen Fehlversuche nicht wegräumen kann.
     */
    removeComment: {
      request: z.object({ commentId: z.string() }),
      response: z.object({ removed: z.number().int() }),
    },
    /** Räumt alle Kommentare eines Tickets in einer Transaktion, ein Ereignis für alle. */
    clearComments: {
      request: z.object({ ticketId: z.string() }),
      response: z.object({ removed: z.number().int() }),
    },
    /**
     * Löst einen Anhang vom Ticket und löscht seine Datei unter `userData/attachments/`.
     * Angehängt wird über `chat.saveAttachment` mit `ticketId`.
     */
    removeAttachment: {
      request: z.object({ ticketId: z.string(), attachmentId: z.string() }),
      response: okSchema,
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
        /** Das Vorgaben-Dokument des Sets, sofern `meta` Zusatzangaben enthielt. */
        guidelines: z
          .object({
            documentId: z.string(),
            title: z.string(),
            sectionKeys: z.array(z.string()),
            charCount: z.number(),
            created: z.boolean(),
          })
          .nullable(),
        /** Zusätzlich mitgeführte Ticketfelder — der Beleg, dass nichts verloren ging. */
        carriedTicketFields: z.array(z.string()),
        /** Was sich nicht abbilden ließ. Leer heißt: alles ist angekommen. */
        unrepresented: z.array(z.string()),
        /** Tolerierte Ungereimtheiten der Datei — der Import läuft trotzdem durch. */
        warnings: z.array(z.string()),
      }),
    },
  },
  skills: {
    list: { request: z.void(), response: z.array(skillSchema) },
    create: { request: createSkillSchema, response: skillSchema },
    update: { request: updateSkillSchema, response: skillSchema },
    remove: { request: idSchema, response: okSchema },
    /**
     * Liest eine `.md` oder `.zip` und hält das Ergebnis im Main-Prozess bereit, ohne zu
     * speichern. Erst `confirmImport` legt den Skill samt Beidateien an.
     */
    previewImport: {
      request: z.object({ fileName: z.string().min(1), dataBase64: z.string() }),
      response: skillImportPreviewSchema,
    },
    confirmImport: {
      request: z.object({
        token: z.string(),
        name: z.string().min(1),
        slug: z.string().optional(),
      }),
      response: skillSchema,
    },
    discardImport: { request: z.object({ token: z.string() }), response: okSchema },
    /** Legt eine Beidatei nachträglich an. Ein vorhandener Pfad wird nicht überschrieben. */
    addFile: {
      request: z.object({
        skillId: z.string(),
        relPath: z.string().min(1),
        dataBase64: z.string(),
      }),
      response: skillSchema,
    },
    /** Entfernt die Beidatei aus der Datenbank und von der Platte. */
    removeFile: {
      request: z.object({ skillId: z.string(), fileId: z.string() }),
      response: skillSchema,
    },
    /** Schreibt `<slug>.zip` mit `SKILL.md` und Beidateien an einen vom Nutzer gewählten Ort. */
    export: { request: idSchema, response: z.object({ path: z.string().nullable() }) },
  },
  /**
   * Externe MCP-Server. **Alle** Methoden stehen in `UNSUPPORTED_METHODS` der
   * Fernzugriff-Brücke: hier werden Zugangsdaten verwaltet, und die Brücke ist ohne
   * Zugangsschutz erreichbar. MCP-Einrichtung gehört an den Rechner, nicht ans Telefon.
   */
  mcp: {
    list: { request: z.void(), response: z.array(mcpServerSchema) },
    listForProject: {
      request: z.object({ projectId: z.string() }),
      response: z.array(mcpServerSchema),
    },
    create: { request: createMcpServerSchema, response: mcpServerSchema },
    update: { request: updateMcpServerSchema, response: mcpServerSchema },
    remove: { request: idSchema, response: okSchema },
    /** Weist den Server einem Projekt zu und liefert die neue Liste des Projekts. */
    assign: {
      request: z.object({ projectId: z.string(), serverId: z.string() }),
      response: z.array(mcpServerSchema),
    },
    unassign: {
      request: z.object({ projectId: z.string(), serverId: z.string() }),
      response: z.array(mcpServerSchema),
    },
    /**
     * `initialize` → `notifications/initialized` → `tools/list` gegen den Server. Mit `id`
     * gegen den gespeicherten Stand (samt Geheimnissen), ohne `id` gegen einen Entwurf.
     */
    probe: {
      request: createMcpServerSchema.partial().extend({ id: z.string().nullable().optional() }),
      response: mcpProbeResultSchema,
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
    /** Sammellöschen in einer Transaktion — unbekannte IDs werden übersprungen. */
    removeMany: {
      request: z.object({ ids: z.array(z.number().int()) }),
      response: z.object({ removed: z.number().int() }),
    },
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
  attachments: {
    /**
     * Öffnet einen Anhang im Standardprogramm des Systems. Der Renderer nennt nur die ID —
     * einen Dateisystempfad bekommt er nie in die Hand.
     */
    open: { request: z.object({ attachmentId: z.string() }), response: okSchema },
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
  /**
   * Die Fernzugriff-Brücke. Ein- und ausgeschaltet wird sie über `settings.save`; hier steht
   * nur, was zur Laufzeit gilt — Port, erreichbare Adressen, verbundene Geräte.
   */
  remote: {
    status: { request: z.void(), response: remoteStatusSchema },
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
  /** Ein gebündeltes Ereignis für das Bereinigen — nicht eines je gelöschter Nachricht. */
  'chat.historyCleared': z.object({
    projectId: z.string(),
    deleted: z.number(),
  }),
  'ticket.changed': z.object({
    projectId: z.string(),
    ticketId: z.string(),
    /** Bei Sammelaktionen alle betroffenen Tickets; `ticketId` ist dann das erste davon. */
    ticketIds: z.array(z.string()).optional(),
    action: changeActionSchema,
  }),
  'document.changed': z.object({
    projectId: z.string(),
    documentId: z.string(),
    action: changeActionSchema,
  }),
  'skill.changed': z.object({
    skillId: z.string(),
    action: changeActionSchema,
  }),
  /** `projectId` ist gesetzt, wenn sich eine Zuweisung geändert hat, sonst der Server selbst. */
  'mcpServer.changed': z.object({
    serverId: z.string(),
    projectId: z.string().nullable(),
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
  /**
   * Was ein Agent in einem Vorhaben gerade tut. Bewusst kein Checkpoint-Feld: das Ereignis
   * kommt bei jedem Werkzeugaufruf und hat in der Datenbank nichts verloren.
   */
  'goal.activity': z.object({
    goalId: z.number(),
    ticketId: z.string().nullable(),
    agentId: z.string(),
    /** Beschriftung des laufenden Werkzeugs; `null`, solange der Agent überlegt. */
    tool: z.string().nullable(),
    /** Seit wann dieser Zustand anhält, als ISO-Zeitstempel. */
    since: z.string(),
  }),
  'claude.status': claudeStatusSchema,
  'log.entry': logEntrySchema,
  /** Brücke an oder aus, Gerät gekommen oder gegangen. */
  'remote.changed': remoteStatusSchema,
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
