export enum IpcChannel {
  GET_STATE = 'get-state',
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  GET_LOGS = 'get-logs',
  GET_SETTINGS = 'get-settings',
  SAVE_SETTINGS = 'save-settings',
  STATE_UPDATE = 'state-update',
  LOG_UPDATE = 'log-update',
  MINIMIZE_TO_TRAY = 'minimize-to-tray',

  // Projects
  GET_PROJECTS = 'get-projects',
  CREATE_PROJECT = 'create-project',
  UPDATE_PROJECT = 'update-project',
  DELETE_PROJECT = 'delete-project',

  // Global Agents
  GET_GLOBAL_AGENTS = 'get-global-agents',
  CREATE_GLOBAL_AGENT = 'create-global-agent',
  UPDATE_GLOBAL_AGENT = 'update-global-agent',
  DELETE_GLOBAL_AGENT = 'delete-global-agent',

  // Project Agents
  ADD_AGENT = 'add-agent-to-project',
  REMOVE_AGENT = 'remove-agent-from-project',
  GENERATE_AGENT_PROMPT = 'generate-agent-prompt',
  SET_AGENT_STOPPED = 'set-agent-stopped',

  // Chat
  SEND_MESSAGE = 'send-chat-message',
  GET_MESSAGES = 'get-messages',
  DELETE_MESSAGE = 'delete-chat-message',
  STOP_AGENT_CHAT = 'stop-agent-chat',
  RETRY_MESSAGE = 'retry-chat-message',

  // Tickets
  GET_TICKETS = 'get-tickets',
  CREATE_TICKET = 'create-ticket',
  UPDATE_TICKET = 'update-ticket',
  DELETE_TICKET = 'delete-ticket',
  ADD_TICKET_COMMENT = 'add-ticket-comment',
  IMPORT_TICKETS = 'tickets:import',

  // Documents
  GET_DOCUMENTS = 'get-documents',
  CREATE_DOCUMENT = 'create-document',
  UPDATE_DOCUMENT = 'update-document',
  DELETE_DOCUMENT = 'delete-document',

  // Agent Memory
  GET_AGENT_MEMORIES = 'get-agent-memories',
  SAVE_AGENT_MEMORY = 'save-agent-memory',
  DELETE_AGENT_MEMORY = 'delete-agent-memory',
  CLEAR_AGENT_MEMORIES = 'clear-agent-memories',

  // Goals (Autonomous Loop)
  START_GOAL = 'start-goal',
  START_GOAL_FROM_TICKETS = 'start-goal-from-tickets',
  GET_GOALS = 'get-goals',
  GET_GOAL_LOG = 'get-goal-log',
  CANCEL_GOAL = 'cancel-goal',
  RETRY_GOAL = 'retry-goal',

  // Email Verification
  SEND_EMAIL_VERIFICATION = 'send-email-verification',
  VERIFY_EMAIL_CODE = 'verify-email-code',
  RESEND_EMAIL_VERIFICATION = 'resend-email-verification',

  // Ratings (Bewertungssystem)
  SUBMIT_RATING = 'submit-rating',
  GET_RATINGS = 'get-ratings',
  GET_RATING = 'get-rating',
  DELETE_RATING = 'delete-rating',
  VERIFY_RATING = 'verify-rating',
  RESEND_VERIFICATION = 'resend-verification',
  RATING_UPDATE = 'rating-update',

  // File picker
  PICK_AND_READ_FILE = 'pick-and-read-file',

  // Attachments
  SAVE_ATTACHMENT = 'save-attachment',

  // Export
  EXPORT_PDF = 'export-pdf',

  // Sync
  GET_SYNC_STATUS = 'get-sync-status',
  TRIGGER_FULL_SYNC = 'trigger-full-sync',

  // Events (main → renderer)
  CHAT_MESSAGE_UPDATE = 'chat-message-update',
  AGENT_STATUS_UPDATE = 'agent-status-update',
  SYNC_STATUS_UPDATE = 'sync-status-update',
  TICKET_UPDATE = 'ticket-update',
  DOCUMENT_UPDATE = 'document-update',
  GOAL_PHASE_UPDATE = 'goal-phase-update',
  GOAL_COMPLETE = 'goal-complete',
  GOAL_FAILED = 'goal-failed',
  GOAL_STATUS_UPDATE = 'goal-status-update',
  GOAL_LOG_UPDATE = 'goal-log-update',
}
