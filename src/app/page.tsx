import { ChatPanel } from "@/components/ChatPanel";

export default function Home() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ●
          </span>
          <span className="brand-name">michi</span>
          <span className="brand-sub">mugshot artisan cafe</span>
        </div>
      </header>
      <ChatPanel />
    </div>
  );
}
