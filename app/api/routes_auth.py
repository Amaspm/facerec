from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt

from app.config import ADMIN_PASSWORD, JWT_ALGORITHM, JWT_EXPIRE_MINUTES, SECRET_KEY
from app.models.schemas import TokenResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])

_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# Hash password admin satu kali saat module di-load
_ADMIN_PASSWORD_HASH: bytes = bcrypt.hashpw(
    ADMIN_PASSWORD.encode(), bcrypt.gensalt()
)


def _create_access_token(data: dict) -> str:
    payload = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES)
    payload.update({"exp": expire})
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def get_current_admin(token: str = Depends(_oauth2_scheme)) -> str:
    """Dependency — validasi JWT, kembalikan username admin."""
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token tidak valid atau kadaluarsa",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
        sub: str | None = payload.get("sub")
        if sub is None:
            raise credentials_exc
    except JWTError:
        raise credentials_exc
    return sub


@router.post("/login", response_model=TokenResponse)
def login(form: OAuth2PasswordRequestForm = Depends()):
    """Login admin — kembalikan JWT Bearer token."""
    password_match = bcrypt.checkpw(
        form.password.encode(), _ADMIN_PASSWORD_HASH
    )
    if not password_match:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Password salah",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = _create_access_token({"sub": form.username or "admin"})
    return TokenResponse(access_token=token, token_type="bearer")


@router.get("/me", tags=["auth"])
def get_me(admin: str = Depends(get_current_admin)):
    """Cek apakah token masih valid."""
    return {"username": admin, "status": "authenticated"}
