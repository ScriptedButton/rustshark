"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";

export default function Navbar() {
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background">
      <div className="container flex h-16 items-center px-4">
        <div className="mr-4 flex">
          <Link href="/" className="flex items-center space-x-2">
            <span className="font-bold inline-block text-xl">RustShark</span>
          </Link>
        </div>
        <NavigationMenu className="ml-auto">
          <NavigationMenuList>
            <NavigationMenuItem>
              <Link href="/" legacyBehavior passHref>
                <NavigationMenuLink
                  className={navigationMenuTriggerStyle({
                    className: isActive("/")
                      ? "bg-accent text-accent-foreground"
                      : "",
                  })}
                >
                  Dashboard
                </NavigationMenuLink>
              </Link>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <Link href="/packets" legacyBehavior passHref>
                <NavigationMenuLink
                  className={navigationMenuTriggerStyle({
                    className: isActive("/packets")
                      ? "bg-accent text-accent-foreground"
                      : "",
                  })}
                >
                  Packets
                </NavigationMenuLink>
              </Link>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <Link href="/stats" legacyBehavior passHref>
                <NavigationMenuLink
                  className={navigationMenuTriggerStyle({
                    className: isActive("/stats")
                      ? "bg-accent text-accent-foreground"
                      : "",
                  })}
                >
                  Statistics
                </NavigationMenuLink>
              </Link>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <Link href="/settings" legacyBehavior passHref>
                <NavigationMenuLink
                  className={navigationMenuTriggerStyle({
                    className: isActive("/settings")
                      ? "bg-accent text-accent-foreground"
                      : "",
                  })}
                >
                  Settings
                </NavigationMenuLink>
              </Link>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
        <div className="ml-4">
          <span className="text-sm text-muted-foreground">v0.2.0</span>
        </div>
      </div>
    </header>
  );
}
