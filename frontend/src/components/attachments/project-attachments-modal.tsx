"use client";

import { AttachmentsPanel } from "./attachments-panel";
import { Modal } from "@/components/ui/modal";

export function ProjectAttachmentsModal({
  open,
  onClose,
  projectId,
  currentUserId,
  canAdminister,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  currentUserId: string | null;
  canAdminister: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Project files" size="lg">
      <div className="max-h-[72vh] overflow-y-auto pr-1">
        <AttachmentsPanel
          scope="project"
          resourceId={projectId}
          projectId={projectId}
          currentUserId={currentUserId}
          canAdminister={canAdminister}
        />
      </div>
    </Modal>
  );
}
