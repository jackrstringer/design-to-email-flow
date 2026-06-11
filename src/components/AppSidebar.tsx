import { List, Building2, Users, Settings, LogOut, Send, BarChart3 } from "lucide-react";
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
  SidebarTrigger,
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
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader>
        <div
          className={
            collapsed
              ? "flex flex-col items-center gap-1 py-2"
              : "flex items-center gap-2.5 px-2 py-2.5"
          }
        >
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand shadow-[0_1px_2px_rgb(0_0_0_/_0.12)]"
            aria-hidden="true"
          >
            <Send className="h-3.5 w-3.5 text-brand-foreground" strokeWidth={2.5} />
          </span>
          {!collapsed && (
            <span className="flex-1 text-[15px] font-semibold tracking-tight text-foreground">
              Sendr
            </span>
          )}
          <SidebarTrigger className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                    className="h-8 rounded-lg text-[13px] font-medium transition-colors duration-150 data-[active=true]:bg-sidebar-accent data-[active=true]:text-foreground data-[active=true]:shadow-[inset_0_0_0_1px_hsl(var(--sidebar-border))]"
                  >
                    <NavLink to={item.url}>
                      <item.icon
                        className={
                          isActive(item.url)
                            ? "h-4 w-4 text-brand"
                            : "h-4 w-4 text-sidebar-foreground/70"
                        }
                        strokeWidth={2}
                      />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={
                collapsed
                  ? "flex w-full items-center justify-center rounded-lg py-2 transition-colors duration-150 hover:bg-sidebar-accent focus-visible:outline-none"
                  : "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-150 hover:bg-sidebar-accent focus-visible:outline-none"
              }
              aria-label="Account menu"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                {initial}
              </span>
              {!collapsed && (
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {email}
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
    </Sidebar>
  );
}
