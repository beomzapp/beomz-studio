import { useNavigate } from "@tanstack/react-router";
import { CheckCircle } from "lucide-react";
import { AuthModal } from "../../../components/auth/AuthModal";

export function LoginPage() {
  const navigate = useNavigate();
  const passwordReset = new URLSearchParams(window.location.search).get("_pwreset") === "1";

  const handleClose = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      void navigate({ to: "/" });
    }
  };

  return (
    <div className="min-h-screen bg-bg">
      {passwordReset && (
        <div className="fixed top-4 left-1/2 z-[60] -translate-x-1/2 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 text-sm font-medium text-green-700 shadow-sm">
          <CheckCircle size={15} />
          Password updated — please sign in.
        </div>
      )}
      <AuthModal open={true} onClose={handleClose} initialMode="signin" />
    </div>
  );
}
