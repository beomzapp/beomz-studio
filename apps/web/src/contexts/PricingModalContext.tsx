/**
 * PricingModalContext — global open/close state for the PricingModal.
 * Provider mounts once at the app root so any component can trigger it.
 */
import { createContext, useCallback, useContext, useState } from "react";

interface PricingModalContextValue {
  isOpen: boolean;
  openPricingModal: () => void;
  closePricingModal: () => void;
}

const PricingModalContext = createContext<PricingModalContextValue>({
  isOpen: false,
  openPricingModal: () => {},
  closePricingModal: () => {},
});

export function PricingModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openPricingModal = useCallback(() => setIsOpen(true), []);
  const closePricingModal = useCallback(() => setIsOpen(false), []);

  return (
    <PricingModalContext.Provider value={{ isOpen, openPricingModal, closePricingModal }}>
      {children}
    </PricingModalContext.Provider>
  );
}

export function usePricingModal(): PricingModalContextValue {
  return useContext(PricingModalContext);
}
