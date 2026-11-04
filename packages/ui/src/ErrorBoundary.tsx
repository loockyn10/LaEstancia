import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./Button";

type Props = {
  children: ReactNode;
  /** Muestra el error técnico (sólo desarrollo). */
  showDetails?: boolean;
  onError?: (error: Error, info: ErrorInfo) => void;
};

/** Evita la pantalla en blanco ante un error de render: muestra un mensaje humano y permite recargar. */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
    console.error("Unhandled UI error", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="shell">
        <section className="welcome-card" role="alert">
          <p className="eyebrow">La Estancia</p>
          <h1>Algo salió mal</h1>
          <p className="message">Ocurrió un error inesperado. Tus datos guardados no se modificaron. Probá recargar la pantalla.</p>
          {this.props.showDetails && <pre className="error-detail">{error.stack ?? error.message}</pre>}
          <div className="form-actions">
            <Button onClick={() => window.location.reload()}>Recargar</Button>
          </div>
        </section>
      </main>
    );
  }
}
