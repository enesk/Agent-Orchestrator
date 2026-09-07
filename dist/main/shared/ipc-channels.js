"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IpcChannel = void 0;
var IpcChannel;
(function (IpcChannel) {
    IpcChannel["GET_STATE"] = "get-state";
    IpcChannel["CONNECT"] = "connect";
    IpcChannel["DISCONNECT"] = "disconnect";
    IpcChannel["GET_LOGS"] = "get-logs";
    IpcChannel["GET_SETTINGS"] = "get-settings";
    IpcChannel["SAVE_SETTINGS"] = "save-settings";
    IpcChannel["STATE_UPDATE"] = "state-update";
    IpcChannel["LOG_UPDATE"] = "log-update";
    IpcChannel["MINIMIZE_TO_TRAY"] = "minimize-to-tray";
    // Projects
    IpcChannel["GET_PROJECTS"] = "get-projects";
    IpcChannel["CREATE_PROJECT"] = "create-project";
    IpcChannel["UPDATE_PROJECT"] = "update-project";
    IpcChannel["DELETE_PROJECT"] = "delete-project";
    // Global Agents
    IpcChannel["GET_GLOBAL_AGENTS"] = "get-global-agents";
    IpcChannel["CREATE_GLOBAL_AGENT"] = "create-global-agent";
    IpcChannel["UPDATE_GLOBAL_AGENT"] = "update-global-agent";
    IpcChannel["DELETE_GLOBAL_AGENT"] = "delete-global-agent";
    // Project Agents
    IpcChannel["ADD_AGENT"] = "add-agent-to-project";
    IpcChannel["REMOVE_AGENT"] = "remove-agent-from-project";
    IpcChannel["GENERATE_AGENT_PROMPT"] = "generate-agent-prompt";
    IpcChannel["SET_AGENT_STOPPED"] = "set-agent-stopped";
    // Chat
    IpcChannel["SEND_MESSAGE"] = "send-chat-message";
    IpcChannel["GET_MESSAGES"] = "get-messages";
    IpcChannel["DELETE_MESSAGE"] = "delete-chat-message";
    IpcChannel["STOP_AGENT_CHAT"] = "stop-agent-chat";
    IpcChannel["RETRY_MESSAGE"] = "retry-chat-message";
    // Tickets
    IpcChannel["GET_TICKETS"] = "get-tickets";
    IpcChannel["CREATE_TICKET"] = "create-ticket";
    IpcChannel["UPDATE_TICKET"] = "update-ticket";
    IpcChannel["DELETE_TICKET"] = "delete-ticket";
    IpcChannel["ADD_TICKET_COMMENT"] = "add-ticket-comment";
    IpcChannel["IMPORT_TICKETS"] = "tickets:import";
    // Documents
    IpcChannel["GET_DOCUMENTS"] = "get-documents";
    IpcChannel["CREATE_DOCUMENT"] = "create-document";
    IpcChannel["UPDATE_DOCUMENT"] = "update-document";
    IpcChannel["DELETE_DOCUMENT"] = "delete-document";
    // Agent Memory
    IpcChannel["GET_AGENT_MEMORIES"] = "get-agent-memories";
    IpcChannel["SAVE_AGENT_MEMORY"] = "save-agent-memory";
    IpcChannel["DELETE_AGENT_MEMORY"] = "delete-agent-memory";
    IpcChannel["CLEAR_AGENT_MEMORIES"] = "clear-agent-memories";
    // Goals (Autonomous Loop)
    IpcChannel["START_GOAL"] = "start-goal";
    IpcChannel["START_GOAL_FROM_TICKETS"] = "start-goal-from-tickets";
    IpcChannel["GET_GOALS"] = "get-goals";
    IpcChannel["GET_GOAL_LOG"] = "get-goal-log";
    IpcChannel["CANCEL_GOAL"] = "cancel-goal";
    IpcChannel["RETRY_GOAL"] = "retry-goal";
    // Email Verification
    IpcChannel["SEND_EMAIL_VERIFICATION"] = "send-email-verification";
    IpcChannel["VERIFY_EMAIL_CODE"] = "verify-email-code";
    IpcChannel["RESEND_EMAIL_VERIFICATION"] = "resend-email-verification";
    // Ratings (Bewertungssystem)
    IpcChannel["SUBMIT_RATING"] = "submit-rating";
    IpcChannel["GET_RATINGS"] = "get-ratings";
    IpcChannel["GET_RATING"] = "get-rating";
    IpcChannel["DELETE_RATING"] = "delete-rating";
    IpcChannel["VERIFY_RATING"] = "verify-rating";
    IpcChannel["RESEND_VERIFICATION"] = "resend-verification";
    IpcChannel["RATING_UPDATE"] = "rating-update";
    // File picker
    IpcChannel["PICK_AND_READ_FILE"] = "pick-and-read-file";
    // Attachments
    IpcChannel["SAVE_ATTACHMENT"] = "save-attachment";
    // Export
    IpcChannel["EXPORT_PDF"] = "export-pdf";
    // Sync
    IpcChannel["GET_SYNC_STATUS"] = "get-sync-status";
    IpcChannel["TRIGGER_FULL_SYNC"] = "trigger-full-sync";
    // Events (main → renderer)
    IpcChannel["CHAT_MESSAGE_UPDATE"] = "chat-message-update";
    IpcChannel["AGENT_STATUS_UPDATE"] = "agent-status-update";
    IpcChannel["SYNC_STATUS_UPDATE"] = "sync-status-update";
    IpcChannel["TICKET_UPDATE"] = "ticket-update";
    IpcChannel["DOCUMENT_UPDATE"] = "document-update";
    IpcChannel["GOAL_PHASE_UPDATE"] = "goal-phase-update";
    IpcChannel["GOAL_COMPLETE"] = "goal-complete";
    IpcChannel["GOAL_FAILED"] = "goal-failed";
    IpcChannel["GOAL_STATUS_UPDATE"] = "goal-status-update";
    IpcChannel["GOAL_LOG_UPDATE"] = "goal-log-update";
})(IpcChannel || (exports.IpcChannel = IpcChannel = {}));
//# sourceMappingURL=ipc-channels.js.map