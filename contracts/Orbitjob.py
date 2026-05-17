# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *


class Orbitjob(gl.Contract):
    task_counter: u32
    titles: TreeMap[u32, str]
    descriptions: TreeMap[u32, str]
    rewards: TreeMap[u32, u32]
    statuses: TreeMap[u32, str]
    agents: TreeMap[u32, str]
    outputs: TreeMap[u32, str]

    def __init__(self):
        pass

    @gl.public.write
    def post_task(self, title: str, description: str, reward: u32) -> u32:
        self.task_counter += u32(1)
        task_id = self.task_counter

        self.titles[task_id] = title
        self.descriptions[task_id] = description
        self.rewards[task_id] = reward
        self.statuses[task_id] = "PENDING"
        self.agents[task_id] = ""
        self.outputs[task_id] = ""

        return task_id

    @gl.public.write
    def submit_execution(self, task_id: u32, output: str, agent_id: str) -> bool:
        if self.statuses[task_id] == "":
            raise Exception("Task not found")

        self.outputs[task_id] = output
        self.agents[task_id] = agent_id
        self.statuses[task_id] = "COMPLETED"

        return True

    @gl.public.view
    def get_task_title(self, task_id: u32) -> str:
        return self.titles[task_id]

    @gl.public.view
    def get_task_status(self, task_id: u32) -> str:
        return self.statuses[task_id]

    @gl.public.view
    def get_task_output(self, task_id: u32) -> str:
        return self.outputs[task_id]

    @gl.public.view
    def get_task_counter(self) -> u32:
        return self.task_counter
