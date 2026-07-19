import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    checkout_burst: {
      executor: "ramping-arrival-rate",
      startRate: 10,
      timeUnit: "1s",
      preAllocatedVUs: 200,
      maxVUs: 2000,
      stages: [
        { target: Number(__ENV.TARGET_RPS || 100), duration: "1m" },
        { target: Number(__ENV.TARGET_RPS || 100), duration: "3m" },
        { target: 0, duration: "30s" },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<1500", "p(99)<3000"],
  },
};

const API_URL = __ENV.API_URL || "http://127.0.0.1:5000";
const TOKEN = __ENV.CUSTOMER_TOKEN || "";
const ADDRESS_ID = Number(__ENV.ADDRESS_ID || 1);

export default function () {
  const idem = `${__VU}-${__ITER}-${Date.now()}`;
  const res = http.post(
    `${API_URL}/api/orders`,
    JSON.stringify({ addressId: ADDRESS_ID, paymentMethod: "cod", notes: "k6 burst test" }),
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
        "Idempotency-Key": idem,
        "X-Correlation-Id": `k6-${idem}`,
      },
      timeout: "10s",
    },
  );
  check(res, {
    "durable response": (r) => [201, 400, 409, 425, 429].includes(r.status),
    "no stack leak": (r) => !String(r.body).includes("stack") && !String(r.body).includes("postgres://"),
  });
  sleep(0.1);
}
