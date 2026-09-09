import { CampusChat } from "@/components/CampusChat";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import AdminOverview from "./pages/admin/AdminOverview";
import BuildingsAdmin from "./pages/admin/BuildingsAdmin";
import NewsAdmin from "./pages/admin/NewsAdmin";
import SettingsAdmin from "./pages/admin/SettingsAdmin";
import UsersAdmin from "./pages/admin/UsersAdmin";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/admin" component={AdminOverview} />
      <Route path="/admin/buildings" component={BuildingsAdmin} />
      <Route path="/admin/news" component={NewsAdmin} />
      <Route path="/admin/users" component={UsersAdmin} />
      <Route path="/admin/settings" component={SettingsAdmin} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
          <CampusChat />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
