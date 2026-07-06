from fastapi import APIRouter, Response, status

router = APIRouter(tags=["model-profiles"])
DEPRECATION_HEADER = "VINote local LLM model profiles are deprecated; connect VILab Server via /api/vilab-server/connection."


def _gone(response: Response):
    response.headers["Deprecation"] = "true"
    response.headers["X-VINote-Deprecated"] = DEPRECATION_HEADER
    response.status_code = status.HTTP_410_GONE
    return {
        "detail": DEPRECATION_HEADER,
        "replacement": "/api/vilab-server/connection",
    }


@router.get("/model-profiles", status_code=status.HTTP_410_GONE)
def list_model_profiles(response: Response):
    return _gone(response)


@router.post("/model-profiles", status_code=status.HTTP_410_GONE)
def create_model_profile(response: Response):
    return _gone(response)


@router.patch("/model-profiles/{profile_id}", status_code=status.HTTP_410_GONE)
def update_model_profile(profile_id: str, response: Response):
    del profile_id
    return _gone(response)


@router.delete("/model-profiles/{profile_id}", status_code=status.HTTP_410_GONE)
def delete_model_profile(profile_id: str, response: Response):
    del profile_id
    return _gone(response)


@router.post("/model-profiles/{profile_id}/set-default", status_code=status.HTTP_410_GONE)
def set_default_model_profile(profile_id: str, response: Response):
    del profile_id
    return _gone(response)


@router.post("/model-profiles/test", status_code=status.HTTP_410_GONE)
def test_model_profile(response: Response):
    return _gone(response)


@router.post("/model-profiles/{profile_id}/test", status_code=status.HTTP_410_GONE)
def test_saved_model_profile(profile_id: str, response: Response):
    del profile_id
    return _gone(response)
