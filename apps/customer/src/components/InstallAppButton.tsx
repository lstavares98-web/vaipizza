import { useEffect, useMemo, useState } from "react";
import "./InstallAppButton.css";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as NavigatorWithStandalone).standalone);
}

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export default function InstallAppButton({ variant = "topbar" }: { variant?: "topbar" | "cinema" }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandaloneMode);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const ios = useMemo(isIosDevice, []);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setShowIosGuide(false);
    };
    const media = window.matchMedia("(display-mode: standalone)");
    const onDisplayModeChange = () => setInstalled(isStandaloneMode());

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    media.addEventListener?.("change", onDisplayModeChange);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      media.removeEventListener?.("change", onDisplayModeChange);
    };
  }, []);

  if (installed || (!installPrompt && !ios)) return null;

  async function install() {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setInstallPrompt(null);
      }
      return;
    }
    if (ios) setShowIosGuide(true);
  }

  return (
    <>
      <button type="button" className={`install-app-btn install-app-btn-${variant}`} onClick={() => void install()}>
        <span aria-hidden="true">↓</span>
        Instalar app
      </button>

      {showIosGuide && (
        <div className="install-guide-backdrop" onMouseDown={() => setShowIosGuide(false)}>
          <div className="install-guide" role="dialog" aria-modal="true" aria-labelledby="install-guide-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="install-guide-close" type="button" aria-label="Fechar" onClick={() => setShowIosGuide(false)}>×</button>
            <span className="install-guide-icon" aria-hidden="true">↥</span>
            <h2 id="install-guide-title">Instalar a VaiPizza</h2>
            <p>No Safari, toque em <strong>Partilhar</strong> e depois escolha <strong>Adicionar ao ecrã principal</strong>.</p>
            <p className="install-guide-hint">Depois, a VaiPizza abre como aplicação, sem a barra normal do navegador.</p>
            <button type="button" className="install-guide-ok" onClick={() => setShowIosGuide(false)}>Entendi</button>
          </div>
        </div>
      )}
    </>
  );
}
