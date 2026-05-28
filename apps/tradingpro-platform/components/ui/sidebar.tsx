"use client";
import { cn } from "@/lib/utils";
import React, { useState, createContext, useContext } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu as IconMenu2, X as IconX } from "lucide-react";

interface Links {
  label: string;
  href: string;
  icon: React.JSX.Element | React.ReactNode;
}

interface SidebarContextProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
}

const SidebarContext = createContext<SidebarContextProps | undefined>(
  undefined
);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  const [openState, setOpenState] = useState(false);

  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate: animate }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
      {children}
    </SidebarProvider>
  );
};

export const SidebarBody = (props: React.ComponentProps<typeof motion.div>) => {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileSidebar {...(props as React.ComponentProps<"div">)} />
    </>
  );
};

export const DesktopSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) => {
  // Desktop sidebar is always fully expanded - no hover behavior
  console.log('🖥️ [DESKTOP-SIDEBAR] Rendering static desktop sidebar')
  
  return (
    <motion.div
      className={cn(
        "h-full w-[280px] lg:w-[300px] shrink-0 flex flex-col",
        "bg-card border-r border-border shadow-sm",
        className
      )}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export const MobileSidebar = ({
  className,
  children,
  showTriggerBar = true,
  ...props
}: React.ComponentProps<"div"> & { showTriggerBar?: boolean }) => {
  const { open, setOpen } = useSidebar();
  
  console.log('📱 [MOBILE-SIDEBAR] Rendering with open:', open)
  
  return (
    <>
      {showTriggerBar && (
        <div
          className={cn(
            "h-14 px-4 flex flex-row md:hidden items-center justify-between bg-card border-b border-border w-full"
          )}
          {...props}
        >
          <div className="flex justify-end z-20 w-full">
            <IconMenu2
              className="text-foreground cursor-pointer hover:text-primary transition-colors"
              onClick={() => {
                console.log('🍔 [MOBILE-SIDEBAR] Menu toggle clicked')
                setOpen(!open)
              }}
            />
          </div>
        </div>
      )}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] lg:hidden"
              onClick={() => {
                console.log('🎭 [MOBILE-SIDEBAR] Backdrop clicked - closing sidebar')
                setOpen(false)
              }}
            />
            
            {/* Sidebar panel */}
            <motion.div
              initial={{ x: "-100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "-100%", opacity: 0 }}
              transition={{
                duration: 0.3,
                ease: "easeInOut",
              }}
              className={cn(
                "fixed left-0 top-0 h-full w-[280px] sm:w-[320px] z-[100] lg:hidden",
                "bg-card border-r border-border shadow-2xl",
                "flex flex-col overflow-hidden",
                className
              )}
            >
              {/* Close button */}
              <div className="absolute right-4 top-4 z-50">
                <button
                  onClick={() => {
                    console.log('❌ [MOBILE-SIDEBAR] Close button clicked')
                    setOpen(false)
                  }}
                  className="p-2 rounded-full hover:bg-accent transition-colors"
                  aria-label="Close sidebar"
                >
                  <IconX className="w-5 h-5 text-foreground" />
                </button>
              </div>
              
              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {children}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export const SidebarLink = ({
  link,
  className,
  ...props
}: {
  link: Links;
  className?: string;
}) => {
  const { open, animate } = useSidebar();
  return (
    <a
      href={link.href}
      className={cn(
        "flex items-center justify-start gap-2  group/sidebar py-2",
        className
      )}
      {...props}
    >
      {link.icon}

      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        className="text-neutral-700 dark:text-neutral-200 text-sm group-hover/sidebar:translate-x-1 transition duration-150 whitespace-pre inline-block !p-0 !m-0"
      >
        {link.label}
      </motion.span>
    </a>
  );
};
