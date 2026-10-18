-- Verweis vom importierten Ticket auf das Vorgaben-Dokument seines Ticketsets. Der Worker-Lauf
-- liest darüber die Vorgaben, ohne sie über den Dokumenttitel erraten zu müssen — ein Projekt
-- kann mehrere Ticketsets mit unterschiedlichen Vorgaben enthalten.
ALTER TABLE tickets
  ADD COLUMN guidelines_document_id TEXT REFERENCES documents (id) ON DELETE SET NULL;
