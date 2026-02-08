"use client";

import { useState } from "react";

interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  className?: string;
  onChange?: (tabId: string) => void;
  fillHeight?: boolean;
}

export function Tabs({ tabs, defaultTab, className = "", onChange, fillHeight }: TabsProps) {
  const [active, setActive] = useState(defaultTab || tabs[0]?.id);

  const handleChange = (tabId: string) => {
    setActive(tabId);
    onChange?.(tabId);
  };

  return (
    <div className={`${fillHeight ? "flex flex-col flex-1 min-h-0" : ""} ${className}`}>
      <div className="flex border-b border-gray-800 flex-shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleChange(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors duration-150 relative ${
              active === tab.id
                ? "text-blue-400"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {tab.label}
            {active === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
            )}
          </button>
        ))}
      </div>
      <div className={fillHeight ? "flex-1 overflow-y-auto pt-4" : "pt-4"}>
        {tabs.find((t) => t.id === active)?.content}
      </div>
    </div>
  );
}
