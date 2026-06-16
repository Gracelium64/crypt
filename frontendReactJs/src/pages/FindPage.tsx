import FindContact from "@/components/FindContact";
import type { Provider } from "@/types";

type Props = {
  provider: Provider;
  onStartConversation: (chatId: string, provider: Provider) => void;
  token: string | null;
};

export default function FindPage({ provider, onStartConversation, token }: Props) {
  return (
    <FindContact provider={provider} onStartConversation={onStartConversation} token={token} />
  );
}
