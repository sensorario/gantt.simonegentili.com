.PHONY: deploy deploy-log test

deploy:
	@nohup ./scripts/deploy.sh >/dev/null 2>&1 & disown
	@echo "Deploy started in background — tail progress with: make deploy-log"

deploy-log:
	@tail -f log/deploy/latest.log

# Every test of the app (vitest run), in the foreground: a failure fails the target.
test:
	@npm test --silent
