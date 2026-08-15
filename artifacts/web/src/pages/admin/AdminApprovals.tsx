import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { customFetch } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Camera, CheckCircle2, ExternalLink, Store, XCircle } from "lucide-react";

const QUERY_KEY = ["/api/admin/store-applications"];
const DELIVERY_QUERY_KEY = ["/api/admin/delivery-applications"];

export default function AdminApprovals() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: applications = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => customFetch<any[]>("/api/admin/store-applications"),
  });
  const { data: deliveryApplications = [], isLoading: loadingDelivery } = useQuery({
    queryKey: DELIVERY_QUERY_KEY,
    queryFn: () => customFetch<any[]>("/api/admin/delivery-applications"),
  });

  const action = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "approve" | "reject" }) =>
      customFetch(`/api/admin/store-applications/${id}/${status}`, {
        method: "POST",
        body: JSON.stringify(status === "reject" ? { reason: "Rejected after admin review" } : {}),
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/stores"] });
      toast({ title: variables.status === "approve" ? "Shop approved" : "Shop rejected" });
    },
    onError: () => toast({ title: "Action failed", variant: "destructive" }),
  });
  const deliveryAction = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "approve" | "reject" }) =>
      customFetch(`/api/admin/delivery-partners/${id}/${status}`, { method: "POST" }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: DELIVERY_QUERY_KEY });
      toast({ title: variables.status === "approve" ? "Delivery partner approved" : "Delivery partner rejected" });
    },
    onError: () => toast({ title: "Action failed", variant: "destructive" }),
  });

  const pending = applications.filter((item: any) => item.status === "pending");
  const reviewed = applications.filter((item: any) => item.status !== "pending");
  const pendingDelivery = deliveryApplications.filter((item: any) => (item.deliveryStatus ?? "pending") === "pending");
  const reviewedDelivery = deliveryApplications.filter((item: any) => (item.deliveryStatus ?? "pending") !== "pending");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Shop Owner Approvals</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review seller details before allowing product upload and order management.</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-48 rounded-xl" />)}</div>
      ) : pending.length === 0 ? (
        <div className="rounded-xl border bg-white py-16 text-center text-muted-foreground">
          <Store className="mx-auto mb-3 h-12 w-12 opacity-30" />
          <p>No pending shop applications</p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {pending.map((app: any) => (
            <ApplicationCard key={app.id} app={app}>
              <Button disabled={action.isPending} onClick={() => action.mutate({ id: app.id, status: "approve" })} className="bg-green-600 hover:bg-green-700">
                <CheckCircle2 className="mr-2 h-4 w-4" />Approve
              </Button>
              <Button disabled={action.isPending} variant="destructive" onClick={() => action.mutate({ id: app.id, status: "reject" })}>
                <XCircle className="mr-2 h-4 w-4" />Reject
              </Button>
            </ApplicationCard>
          ))}
        </div>
      )}

      {reviewed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Reviewed applications</h2>
          <div className="grid gap-4 xl:grid-cols-2">
            {reviewed.map((app: any) => <ApplicationCard key={app.id} app={app} />)}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-bold">Delivery Partner Approvals</h2>
          <p className="text-sm text-muted-foreground">Delivery partners can only enter their panel after admin approval.</p>
        </div>
        {loadingDelivery ? (
          <div className="space-y-3">{Array.from({ length: 2 }).map((_, index) => <Skeleton key={index} className="h-36 rounded-xl" />)}</div>
        ) : pendingDelivery.length === 0 ? (
          <div className="rounded-xl border bg-white py-10 text-center text-muted-foreground">No pending delivery partner applications</div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {pendingDelivery.map((partner: any) => (
              <DeliveryCard key={partner.id} partner={partner}>
                <Button disabled={deliveryAction.isPending} onClick={() => deliveryAction.mutate({ id: partner.id, status: "approve" })} className="bg-green-600 hover:bg-green-700">
                  <CheckCircle2 className="mr-2 h-4 w-4" />Approve
                </Button>
                <Button disabled={deliveryAction.isPending} variant="destructive" onClick={() => deliveryAction.mutate({ id: partner.id, status: "reject" })}>
                  <XCircle className="mr-2 h-4 w-4" />Reject
                </Button>
              </DeliveryCard>
            ))}
          </div>
        )}
        {reviewedDelivery.length > 0 && (
          <div className="grid gap-4 xl:grid-cols-2">
            {reviewedDelivery.map((partner: any) => <DeliveryCard key={partner.id} partner={partner} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function ApplicationCard({ app, children }: { app: any; children?: ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">{app.shopName}</h3>
          <p className="text-sm text-muted-foreground">{app.businessType || "Local retail store"} · {app.category || "General"}</p>
        </div>
        <Badge className={app.status === "approved" ? "bg-green-100 text-green-700" : app.status === "rejected" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}>
          {app.status}
        </Badge>
      </div>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <Info label="Owner" value={app.ownerName} />
        <Info label="Email" value={app.ownerEmail} />
        <Info label="Phone" value={app.ownerPhone} />
        <Info label="UPI" value={app.upiId} />
        <Info label="GST" value={app.gstNumber || "Optional / not provided"} />
        <Info label="PAN" value={app.panNumber || "Not provided"} />
        <Info label="Address" value={`${app.address}, ${app.city}, ${app.state} - ${app.pincode}`} wide />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <DocumentPreview title="Seller / owner photo" src={app.ownerPhoto || app.avatarUrl} />
        <DocumentPreview title="Shop front photo" src={app.shopFrontPhoto || app.bannerUrl} />
      </div>
      {children && <div className="mt-5 flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

function Info({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words font-medium">{value || "-"}</p>
    </div>
  );
}

function DeliveryCard({ partner, children }: { partner: any; children?: ReactNode }) {
  const status = partner.deliveryStatus ?? "pending";
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">{partner.name}</h3>
          <p className="text-sm text-muted-foreground">{partner.vehicleType || "Bike"} · {partner.vehicleNumber || "Vehicle not added"}</p>
        </div>
        <Badge className={status === "approved" ? "bg-green-100 text-green-700" : status === "rejected" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}>
          {status}
        </Badge>
      </div>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <Info label="Phone" value={partner.phone} />
        <Info label="Email" value={partner.email || "Not provided"} />
        <Info label="License" value={partner.licenseNumber || "Not provided"} />
        <Info label="City" value={partner.city || "Not provided"} />
        <Info label="Aadhaar" value={partner.aadhaarLast4 ? `Verified last 4: ${partner.aadhaarLast4}` : "Not provided"} />
        <Info label="PAN" value={partner.panNumber || "Not provided"} />
        <Info label="Emergency" value={partner.emergencyPhone || "Not provided"} />
        <Info label="KYC score" value={partner.kycScore ? `${partner.kycScore}/100` : "Pending"} />
        <Info label="Payout" value={partner.upiId || (partner.bankAccountNumber ? `Bank ending ${String(partner.bankAccountNumber).slice(-4)}` : "Not provided")} />
        <Info label="Identity status" value={partner.identityStatus || "pending_review"} />
        <Info label="Selfie status" value={partner.selfieVerificationStatus || "manual_review_required"} />
        <Info label="Face match" value={partner.faceMatchStatus || "manual_review_required"} />
        <Info label="Document status" value={partner.documentStatus || "pending_review"} />
        <Info label="Bank status" value={partner.bankVerificationStatus || "pending_review"} />
        <Info label="Address" value={`${partner.fullAddress || "Not provided"} ${partner.pincode ? `- ${partner.pincode}` : ""}`} wide />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <DocumentPreview title="Address proof" src={partner.addressProofImage} />
        <DocumentPreview title="Vehicle front" src={partner.vehicleFrontImage} />
        <DocumentPreview title="Number plate" src={partner.numberPlateImage} />
        <DocumentPreview title="Licence front" src={partner.licenseFrontImage} />
        <DocumentPreview title="Licence back" src={partner.licenseBackImage} />
        <DocumentPreview title="Identity front" src={partner.identityFrontImage} />
        <DocumentPreview title="Identity back" src={partner.identityBackImage} />
        <DocumentPreview title="Bank proof" src={partner.bankProofImage} />
        <DocumentPreview title="Profile selfie" src={partner.profileSelfie} />
        <DocumentPreview title="Live selfie" src={partner.liveSelfie} />
      </div>
      {Array.isArray(partner.selfieVerifications) && partner.selfieVerifications.length > 0 && (
        <div className="mt-3 rounded-lg bg-gray-50 p-3 text-xs text-muted-foreground">
          Last verification: {partner.selfieVerifications[0].verificationType} · {partner.selfieVerifications[0].verificationStatus}
        </div>
      )}
      {children && <div className="mt-5 flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

function DocumentPreview({ title, src }: { title: string; src?: string }) {
  const available = Boolean(src && (src.startsWith("data:image/") || /^https?:\/\//i.test(src) || src.startsWith("/")));
  return (
    <div className="rounded-lg border bg-gray-50 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {available ? (
        <a href={src} target="_blank" rel="noreferrer" className="group block" title={`Open ${title} full size`}>
          <img src={src} alt={title} className="h-36 w-full rounded-md border bg-white object-contain" loading="lazy" decoding="async" />
          <span className="mt-2 flex items-center justify-center gap-1 text-xs font-semibold text-blue-700 group-hover:underline">
            <ExternalLink className="h-3.5 w-3.5" /> View full size
          </span>
        </a>
      ) : (
        <div className="flex h-36 items-center justify-center rounded-md border border-dashed bg-white text-sm text-muted-foreground">
          <Camera className="mr-2 h-4 w-4" /> Not submitted
        </div>
      )}
    </div>
  );
}
