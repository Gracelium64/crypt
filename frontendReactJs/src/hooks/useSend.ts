import { useState } from "react";
import { sendMessageService } from "../services/messages";

export default function useSend(authToken: string | null, convHook: any) {
  const [busy, setBusy] = useState(false);

  const sendMessage = async (opts: {
    provider: string;
    selectedChatId: string;
    conversationTarget: string;
    replyMode: "secure" | "plain";
    text?: string;
    file?: File | null;
    imageUrl?: string;
    privJwk?: any | null;
    localOwnerId?: string | null;
  }) => {
    setBusy(true);
    try {
      await sendMessageService({
        provider: opts.provider,
        selectedChatId: opts.selectedChatId,
        conversationTarget: opts.conversationTarget,
        replyMode: opts.replyMode,
        text: opts.text ?? "",
        file: opts.file,
        imageUrl: opts.imageUrl,
        authToken: authToken,
        privJwk: opts.privJwk,
        localOwnerId: opts.localOwnerId,
      });

      // Refresh conversations/messages using convHook passed from App
      try {
        if (convHook?.loadConversations) {
          await convHook.loadConversations(opts.provider);
        }
        if (convHook?.loadMessages) {
          await convHook.loadMessages(
            opts.provider,
            opts.selectedChatId,
            undefined,
            opts.privJwk,
            opts.localOwnerId,
          );
        }
      } catch {
        // non-fatal refresh errors
      }

      return true;
    } catch (_err) {
      console.error("sendMessage failed", _err);
      throw _err;
    } finally {
      setBusy(false);
    }
  };

  return { sendMessage, busy };
}
