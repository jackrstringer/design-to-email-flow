import { List, Building2, Users, Settings, LogOut, Send, BarChart3, Plus } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthContext } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const navItems = [
  { title: "Queue", url: "/queue", icon: List },
  { title: "Brands", url: "/brands", icon: Building2 },
  { title: "Segments", url: "/segments", icon: Users },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuthContext();

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  const email = user?.email ?? "";
  const initial = email.charAt(0).toUpperCase() || "S";

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <Sidebar collapsible="icon" variant="floating" className="group/rail">
      <SidebarHeader className={cn("pt-4", collapsed ? "px-2 pb-1" : "px-4 pb-1")}>
        <div className={cn("flex h-8 items-center", collapsed ? "justify-center" : "gap-2.5")}>
          <span
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[9px] bg-white text-[hsl(240_10%_4%)]"
            aria-hidden="true"
          >
            <Send className="h-3.5 w-3.5" strokeWidth={2.4} />
          </span>
          {!collapsed && (
            <span className="flex-1 truncate text-sm font-semibold tracking-[-0.01em] text-white">
              Sendr
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className={cn(collapsed ? "px-1.5" : "px-3")}>
        <SidebarGroup className="p-0 pt-4">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {navItems.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                      className={cn(
                        "h-8 rounded-[11px] px-2.5 text-[12.5px] transition-colors duration-200",
                        active
                          ? "bg-white/[0.09] font-medium text-white shadow-[inset_0_0.5px_0_hsl(0_0%_100%/0.12)] hover:bg-white/[0.09] hover:text-white"
                          : "font-medium text-[hsl(240_5%_65%)] hover:bg-white/[0.04] hover:text-white",
                      )}
                    >
                      <NavLink to={item.url}>
                        <item.icon
                          className={cn(
                            "h-[14px] w-[14px] shrink-0 transition-opacity duration-200",
                            active ? "opacity-100" : "opacity-70",
                          )}
                          strokeWidth={2}
                        />
                        <span className="truncate">{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className={cn("pb-3", collapsed ? "px-1.5" : "px-3")}>
        <button
          onClick={() => navigate("/upload")}
          className={cn(
            "mb-2 flex items-center justify-center gap-1.5 rounded-full bg-white text-[12.5px] font-semibold text-[hsl(240_10%_4%)]",
            "shadow-[inset_0_-1px_0_hsl(0_0%_0%/0.08),0_1px_2px_hsl(0_0%_0%/0.3)]",
            "transition-transform duration-200 active:scale-[0.98]",
            collapsed ? "h-8 w-8 self-center" : "h-[34px] w-full",
          )}
          title="New campaign"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          {!collapsed && "New campaign"}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex w-full items-center rounded-xl border-t border-white/[0.08] text-left outline-none transition-colors duration-200 hover:bg-white/[0.04]",
                collapsed ? "h-9 justify-center" : "h-11 gap-2.5 px-1.5 pt-1",
              )}
              aria-label="Account menu"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[hsl(240_5%_28%)] to-[hsl(240_6%_14%)] text-[10px] font-semibold text-white shadow-[inset_0_0.5px_0_hsl(0_0%_100%/0.15)]">
                {initial}
              </span>
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-medium leading-tight text-white">
                    {email.split("@")[0]}
                  </span>
                  <span className="block truncate text-[10px] leading-tight text-white/40">{email}</span>
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
              {email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/settings")}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>

      {/* click/drag affordance on the rail edge — ⌘B also toggles */}
      <SidebarRail />
    </Sidebar>
  );
}
