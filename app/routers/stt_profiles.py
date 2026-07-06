from fastapi import APIRouter, Response, status

router = APIRouter(tags=["stt-profiles"])
DEPRECATION_HEADER = "VINote local STT profiles are deprecated; connect VILab Server via /api/vilab-server/connection."


def _gone(response: Response):
    response.headers["Deprecation"] = "true"
    response.headers["X-VINote-Deprecated"] = DEPRECATION_HEADER
    response.status_code = status.HTTP_410_GONE
    return {
        "detail": DEPRECATION_HEADER,
        "replacement": "/api/vilab-server/connection",
    }


@router.get("/stt-profiles", status_code=status.HTTP_410_GONE)
def list_stt_profiles(response: Response):
    return _gone(response)


@router.post("/stt-profiles", status_code=status.HTTP_410_GONE)
def create_stt_profile(response: Response):
    return _gone(response)


@router.patch("/stt-profiles/{profile_id}", status_code=status.HTTP_410_GONE)
def update_stt_profile(profile_id: str, response: Response):
    del profile_id
    return _gone(response)


@router.delete("/stt-profiles/{profile_id}", status_code=status.HTTP_410_GONE)
def delete_stt_profile(profile_id: str, response: Response):
    del profile_id
    return _gone(response)


@router.post("/stt-profiles/{profile_id}/set-default", status_code=status.HTTP_410_GONE)
def set_default_stt_profile(profile_id: str, response: Response):
    del profile_id
    return _gone(response)
