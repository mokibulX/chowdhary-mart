import { useListNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, getListNotificationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, CheckCheck, Package, Tag, Info, ShoppingBag } from "lucide-react";
import { Link } from "wouter";

const TYPE_ICONS: Record<string, any> = {
  order: Package,
  coupon: Tag,
  system: Info,
  promo: ShoppingBag,
};

export default function Notifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: notifData, isLoading } = useListNotifications(
    { limit: 50 },
    { query: { enabled: !!user, queryKey: getListNotificationsQueryKey({ limit: 50 }) } }
  );
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const notifications = notifData?.notifications ?? [];
  const unreadCount = notifData?.unreadCount ?? 0;

  const handleMarkAll = () => {
    markAll.mutate(undefined, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListNotificationsQueryKey({ limit: 50 }) });
        toast({ title: "All notifications marked as read" });
      },
    });
  };

  const handleMark = (id: number) => {
    markRead.mutate({ notificationId: id }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListNotificationsQueryKey({ limit: 50 }) }),
    });
  };

  if (!user) return <div className="text-center py-16"><p>Please <Link href="/login" className="text-primary underline">sign in</Link></p></div>;

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          Notifications
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center w-6 h-6 bg-primary text-white text-xs font-bold rounded-full">{unreadCount}</span>
          )}
        </h1>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={handleMarkAll} className="text-primary" data-testid="btn-mark-all">
            <CheckCheck className="w-4 h-4 mr-1" />Mark all read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : !notifications.length ? (
        <div className="text-center py-16">
          <Bell className="w-14 h-14 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {notifications.map((notif: any) => {
            const Icon = TYPE_ICONS[notif.type] ?? Bell;
            return (
              <div
                key={notif.id}
                onClick={() => !notif.isRead && handleMark(notif.id)}
                className={`flex items-start gap-3 p-4 rounded-xl transition-colors cursor-pointer ${!notif.isRead ? "bg-orange-50 border border-orange-100" : "bg-white border"}`}
                data-testid={`notif-${notif.id}`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${!notif.isRead ? "bg-primary/10" : "bg-muted"}`}>
                  <Icon className={`w-4 h-4 ${!notif.isRead ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm ${!notif.isRead ? "font-semibold" : "font-medium"}`}>{notif.title}</p>
                    {!notif.isRead && <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.body}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(notif.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
