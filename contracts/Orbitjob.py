# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json


class Orbitjob(gl.Contract):
    task_counter: str
    tasks: str

    def __init__(self):
        self.task_counter = "0"
        self.tasks = "{}"

    @gl.public.write
    def post_task(self, title: str, description: str, reward: str) -> None:
        counter = int(self.task_counter) + 1
        self.task_counter = str(counter)
        task_id = str(counter)

        all_tasks = json.loads(self.tasks)
        all_tasks[task_id] = {
            "title": title,
            "description": description,
            "reward": reward,
            "status": "PENDING",
            "agent": "",
            "output": "",
        }
        self.tasks = json.dumps(all_tasks, sort_keys=True)

    @gl.public.write
    def submit_execution(self, task_id: str, output: str, agent_id: str) -> None:
        all_tasks = json.loads(self.tasks)
        if task_id in all_tasks:
            all_tasks[task_id]["status"] = "COMPLETED"
            all_tasks[task_id]["output"] = output
            all_tasks[task_id]["agent"] = agent_id
            self.tasks = json.dumps(all_tasks, sort_keys=True)

    @gl.public.view
    def get_task_title(self, task_id: str) -> str:
        all_tasks = json.loads(self.tasks)
        return all_tasks.get(task_id, {}).get("title", "")

    @gl.public.view
    def get_task_status(self, task_id: str) -> str:
        all_tasks = json.loads(self.tasks)
        return all_tasks.get(task_id, {}).get("status", "")

    @gl.public.view
    def get_task_output(self, task_id: str) -> str:
        all_tasks = json.loads(self.tasks)
        return all_tasks.get(task_id, {}).get("output", "")

    @gl.public.view
    def get_task_count(self) -> str:
        return self.task_counter
