import { useNavigate } from "@tanstack/react-router";
import { AuthModal } from "../../../components/auth/AuthModal";

export function SignupPage() {
  const navigate = useNavigate();

  const handleClose = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      void navigate({ to: "/" });
    }
  };

  return (
    <div className="min-h-screen bg-bg">
      <AuthModal open={true} onClose={handleClose} initialMode="signup" />
    </div>
  );
}
