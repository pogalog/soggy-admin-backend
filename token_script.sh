SA="bruno-invoker@soggy-stitches.iam.gserviceaccount.com"
BACKEND_URL="https://soggy-admin-backend-2jd47m3iuq-ue.a.run.app"
TOKEN=$(gcloud auth print-identity-token --audiences="${BACKEND_URL}" --impersonate-service-account="${SA}")
echo ${TOKEN}