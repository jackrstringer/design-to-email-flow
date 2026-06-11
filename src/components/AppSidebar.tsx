import { List, Building2, Users, Settings, LogOut, Send, BarChart3, ChevronsUpDown } from "lucide-react";
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
    <Sidebar collapsible="icon" className="group/rail border-r border-sidebar-border">
      <SidebarHeader className="px-2 pb-1 pt-2">
        <div className={cn("flex h-8 items-center", collapsed ? "justify-center" : "gap-2 pl-1.5 pr-1")}>
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] bg-primary"
            aria-hidden="true"
          >
            <Send className="h-3 w-3 text-primary-foreground" strokeWidth={2.25} />
          </span>
          {!collapsed && (
            <>
              <span className="flex-1 truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground">
                Sendr
              </span>
              {/* collapse control whispers in on rail hover, ⌘B always works */}
              <SidebarTrigger
                title="Collapse sidebar ⌘B"
                className="h-6 w-6 shrink-0 rounded-md text-muted-foreground/0 transition-colors hover:bg-sidebar-accent hover:text-foreground group-hover/rail:text-muted-foreground"
              />
            </>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup className="p-0 pt-1">
          <SidebarGroupContent>
            <SidebarMenu className="gap-px">
              {navItems.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                      className={cn(
                        "h-7 rounded-md px-2 text-[13px] transition-colors duration-100",
                        active
                          ? "bg-sidebar-accent font-medium text-foreground"
                          : "font-normal text-sidebar-foreground/80 hover:text-foreground",
                      )}
                    >
                      <NavLink to={item.url}>
                        <item.icon
                          className={cn("h-[15px] w-[15px] shrink-0", active ? "text-foreground" : "text-sidebar-foreground/55")}
                          strokeWidth={1.75}
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

      <SidebarFooter className="p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex w-full items-center rounded-md text-left outline-none transition-colors duration-100 hover:bg-sidebar-accent focus-visible:ring-1 focus-visible:ring-ring",
                collapsed ? "h-8 justify-center" : "h-8 gap-2 px-1.5",
              )}
              aria-label="Account menu"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                {initial}
              </span>
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{email}</span>
                  <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                </>
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

      {/* click/drag affordance on the rail edge */}
      <SidebarRail />
    </Sidebar>
  );
}
