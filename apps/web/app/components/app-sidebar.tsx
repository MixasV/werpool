"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useFlowWallet } from "../providers/flow-wallet-provider";
import {
  fetchMyPointsSummary,
  type PointsSummary,
} from "../lib/points-api";

interface SidebarLink {
  href: string;
  label: string;
  roles?: string[];
}

const navigation: SidebarLink[] = [
  { href: "/", label: "Home" },
  { href: "/markets", label: "Markets" },
  { href: "/markets/aisports-meta", label: "aiSports Meta" },
  { href: "/markets/create", label: "Launch market", roles: ["admin"] },
  { href: "/admin", label: "Admin", roles: ["admin", "operator"] },
];

const formatAddress = (address?: string | null) => {
  if (!address) {
    return "—";
  }
  const normalized = address.startsWith("0x") ? address.slice(2) : address;
  if (normalized.length <= 8) {
    return `0x${normalized}`;
  }
  return `0x${normalized.slice(0, 4)}…${normalized.slice(-4)}`;
};

export const AppSidebar = () => {
  const pathname = usePathname();
  const { sessionRoles, network, addr, loggedIn } = useFlowWallet();
  const [pointsSummary, setPointsSummary] = useState<PointsSummary | null>(null);
  const [isLoadingPoints, setLoadingPoints] = useState(false);
  const [pointsError, setPointsError] = useState<string | null>(null);

  const normalizedRoles = sessionRoles.map((role) => role.toLowerCase());

  const networkLabel =
    network === "testnet"
      ? "Flow Testnet"
      : network === "mainnet"
        ? "Flow Mainnet"
        : "Flow Emulator";

  const isAllowed = (link: SidebarLink) => {
    if (!link.roles || link.roles.length === 0) {
      return true;
    }
    return link.roles.some((role) => normalizedRoles.includes(role));
  };

  useEffect(() => {
    let cancelled = false;

    if (!loggedIn) {
      setPointsSummary(null);
      setPointsError(null);
      return () => {
        cancelled = true;
      };
    }

    const loadPoints = async () => {
      setLoadingPoints(true);
      try {
        // Only fetch user's own points, no leaderboard
        const summary = await fetchMyPointsSummary();
        if (!cancelled) {
          setPointsSummary(summary);
          setPointsError(null);
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : "Failed to load points";
          setPointsError(message);
        }
      } finally {
        if (!cancelled) {
          setLoadingPoints(false);
        }
      }
    };

    loadPoints();

    const interval = window.setInterval(loadPoints, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [loggedIn]);

  const formattedPoints = useMemo(() => {
    if (!pointsSummary) {
      return "—";
    }
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
    }).format(pointsSummary.total);
  }, [pointsSummary]);

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar__section">
        <p className="app-sidebar__label">Navigation</p>
        <ul className="app-sidebar__links">
          {navigation.filter(isAllowed).map((link) => {
            const isActive = pathname === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="app-sidebar__link"
                  data-active={isActive ? "true" : "false"}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      
      {/* Only show Session and Points sections when logged in */}
      {loggedIn && (
        <>
          <div className="app-sidebar__section app-sidebar__section--status">
            <p className="app-sidebar__label">Session</p>
            <div className="app-sidebar__status-card">
              <span className="app-sidebar__status-line">
                <span className="app-sidebar__status-key">Network</span>
                <span className="app-sidebar__status-value">{networkLabel}</span>
              </span>
              <span className="app-sidebar__status-line">
                <span className="app-sidebar__status-key">Roles</span>
                <span className="app-sidebar__status-value">
                  {normalizedRoles.length > 0 ? normalizedRoles.join(" · ") : "none"}
                </span>
              </span>
              <span className="app-sidebar__status-line">
                <span className="app-sidebar__status-key">Address</span>
                <span className="app-sidebar__status-value">
                  {formatAddress(addr)}
                </span>
              </span>
            </div>
          </div>
          
          <div className="app-sidebar__section app-sidebar__section--points">
            <p className="app-sidebar__label">Points</p>
            <div className="app-sidebar__points-card" data-loading={isLoadingPoints ? "true" : "false"}>
              <div className="app-sidebar__points-total">
                <span className="app-sidebar__points-value">{formattedPoints}</span>
                <span className="app-sidebar__points-hint">your balance</span>
              </div>
              {pointsError && (
                <p className="app-sidebar__points-error">{pointsError}</p>
              )}
            </div>
          </div>
        </>
      )}
    </aside>
  );
};
