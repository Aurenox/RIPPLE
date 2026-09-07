from fastapi import FastAPI

app = FastAPI(title="RIPPLE API")


@app.get("/")
def root():
    return {
        "message": "RIPPLE API is running"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy"
    }