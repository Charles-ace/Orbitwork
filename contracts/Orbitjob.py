# { "Depends": "py-genlayer:test" }
from genlayer import *


class Orbitjob(gl.Contract):
    task_counter: u32
    titles: TreeMap[str, str]
    descriptions: TreeMap[str, str]
    rewards: TreeMap[str, str]
    statuses: TreeMap[str, str]
    agents: TreeMap[str, str]
    outputs: TreeMap[str, str]

    def __init__(self):
        self.task_counter = 0

    @gl.public.write
    def post_task(self, title: str, description: str, reward: str) -> None:
        self.task_counter = self.task_counter + 1
        task_id = str(self.task_counter)

        self.titles[task_id] = title
        self.descriptions[task_id] = description
        self.rewards[task_id] = reward
        self.statuses[task_id] = "PENDING"
        self.agents[task_id] = ""
        self.outputs[task_id] = ""

    @gl.public.write
    def submit_execution(self, task_id: str, output: str, agent_id: str) -> None:
        self.outputs[task_id] = output
        self.agents[task_id] = agent_id
        self.statuses[task_id] = "COMPLETED"

    @gl.public.view
    def get_task_title(self, task_id: str) -> str:
        return self.titles[task_id]

    @gl.public.view
    def get_task_status(self, task_id: str) -> str:
        return self.statuses[task_id]

    @gl.public.view
    def get_task_output(self, task_id: str) -> str:
        return self.outputs[task_id]

    @gl.public.view
    def get_task_count(self) -> str:
        return str(self.task_counter)
