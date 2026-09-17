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
  const [guide, setGuide] = useState<"ios" | "browser" | null>(null);
  const ios = useMemo(isIosDevice, []);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setGuide(null);
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

  if (installed) return null;

  async function install() {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstallPrompt(null);
      return;
    }
    setGuide(ios ? "ios" : "browser");
  }

  return (
    <>
      <button type="button" className={`install-app-btn install-app-btn-${variant}`} onClick={() => void install()}>
        <span aria-hidden="true">↓</span>
        Instalar app
      </button>

      {guide && (
        <div className="install-guide-backdrop" onMouseDown={() => setGuide(null)}>
          <div className="install-guide" role="dialog" aria-modal="true" aria-labelledby="install-guide-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="install-guide-close" type="button" aria-label="Fechar" onClick={() => setGuide(null)}>×</button>
            <span className="install-guide-icon" aria-hidden="true">↥</span>
            <h2 id="install-guide-title">Instalar a VaiPizza</h2>
            {guide === "ios" ? (
              <>
                <p>No Safari, toque em <strong>Partilhar</strong> e depois escolha <strong>Adicionar ao ecrã principal</strong>.</p>
                <p className="install-guide-hint">Depois, a VaiPizza abre como aplicação, sem a barra normal do navegador.</p>
              </>
            ) : (
              <>
                <p>Abra o menu do navegador e escolha <strong>Instalar aplicação</strong>, <strong>Adicionar ao ecrã principal</strong> ou opção equivalente.</p>
                <p className="install-guide-hint">Se essa opção ainda não aparecer, pode continuar a usar o site normalmente e tentar novamente mais tarde.</p>
              </>
            )}
            <button type="button" className="install-guide-ok" onClick={() => setGuide(null)}>Entendi</button>
          </div>
        </div>
      )}
    </>
  );
}
