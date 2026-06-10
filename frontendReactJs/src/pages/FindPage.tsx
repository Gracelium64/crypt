import FindContact from "@/components/FindContact";
import type { Provider } from "@/types";

type Props = {
  provider: Provider;
  onStartConversation: (chatId: string, provider: Provider) => void;
};

export default function FindPage({ provider, onStartConversation }: Props) {
  return (
    <FindContact provider={provider} onStartConversation={onStartConversation} />
  );
}
