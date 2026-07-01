import { useEffect, useMemo, useState } from 'react'
import { Plus, Users } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { getWorkspaceLabel, useTeamStore } from '../stores/teamStore'

export function Team() {
  const { locale } = useI18n()
  const isZh = locale.startsWith('zh')
  const {
    teams,
    currentWorkspace,
    loading,
    error,
    loadTeams,
    createTeam,
    addMember,
    removeMember,
    selectPersonalWorkspace,
    selectTeamWorkspace,
  } = useTeamStore()
  const [teamName, setTeamName] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void loadTeams()
  }, [loadTeams])

  const activeTeam = useMemo(() => {
    if (currentWorkspace.scope !== 'team') {
      return teams[0] ?? null
    }
    return teams.find((team) => team.id === currentWorkspace.teamId) ?? null
  }, [currentWorkspace, teams])

  const workspaceLabel = getWorkspaceLabel(currentWorkspace, teams, isZh ? '个人空间' : 'Personal workspace')

  const handleCreateTeam = async () => {
    if (!teamName.trim()) {
      return
    }
    setSubmitting(true)
    await createTeam(teamName)
    setTeamName('')
    setSubmitting(false)
  }

  const handleAddMember = async () => {
    if (!activeTeam || !memberEmail.trim()) {
      return
    }
    setSubmitting(true)
    const updated = await addMember(activeTeam.id, memberEmail)
    if (updated) {
      setMemberEmail('')
    }
    setSubmitting(false)
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!activeTeam) {
      return
    }
    setSubmitting(true)
    await removeMember(activeTeam.id, memberId)
    setSubmitting(false)
  }

  return (
    <div className="space-y-6 p-8">
      <section className="rounded-3xl border border-gray-200 bg-white p-8 dark:border-gray-700 dark:bg-[#202020]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
              {isZh ? '团队工作区' : 'Team workspace'}
            </p>
            <h2 className="text-3xl font-bold">{isZh ? '把笔记分到个人和团队' : 'Separate personal and team notes'}</h2>
            <p className="max-w-2xl text-sm text-gray-500 dark:text-gray-400">
              {isZh
                ? `当前工作区：${workspaceLabel}。团队笔记只会出现在对应团队的工作区里，个人笔记仍保留在个人空间。`
                : `Current workspace: ${workspaceLabel}. Team notes stay inside their team workspace, while personal notes remain in your personal workspace.`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => selectPersonalWorkspace()}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                currentWorkspace.scope === 'personal'
                  ? 'bg-primary-light text-white dark:bg-primary-dark'
                  : 'border border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
              }`}
            >
              {isZh ? '切到个人空间' : 'Use personal workspace'}
            </button>
            {activeTeam ? (
              <button
                type="button"
                onClick={() => selectTeamWorkspace(activeTeam.id)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  currentWorkspace.scope === 'team' && currentWorkspace.teamId === activeTeam.id
                    ? 'bg-primary-light text-white dark:bg-primary-dark'
                    : 'border border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
                }`}
              >
                {isZh ? '切到当前团队' : 'Use selected team'}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_1.4fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-[#202020]">
            <div className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary-light dark:text-primary-dark" />
              <h3 className="text-lg font-semibold">{isZh ? '创建团队' : 'Create a team'}</h3>
            </div>
            <div className="mt-4 space-y-3">
              <input
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                placeholder={isZh ? '例如：产品组 / 内容团队' : 'Example: Product / Research / Content'}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-light dark:border-gray-700 dark:bg-[#181818]"
              />
              <button
                type="button"
                onClick={() => void handleCreateTeam()}
                disabled={!teamName.trim() || submitting}
                className="rounded-xl bg-primary-light px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-primary-dark"
              >
                {submitting ? (isZh ? '处理中...' : 'Working...') : (isZh ? '创建并切换' : 'Create and switch')}
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-[#202020]">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary-light dark:text-primary-dark" />
              <h3 className="text-lg font-semibold">{isZh ? '你的团队' : 'Your teams'}</h3>
            </div>

            <div className="mt-4 space-y-3">
              {loading ? <p className="text-sm text-gray-500 dark:text-gray-400">{isZh ? '加载中...' : 'Loading...'}</p> : null}
              {teams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => selectTeamWorkspace(team.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    currentWorkspace.scope === 'team' && currentWorkspace.teamId === team.id
                      ? 'border-primary-light bg-primary-light/5 dark:border-primary-dark dark:bg-primary-dark/10'
                      : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{team.name}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {team.memberCount} {isZh ? '位成员' : team.memberCount === 1 ? 'member' : 'members'}
                      </div>
                    </div>
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600 dark:bg-[#181818] dark:text-gray-300">
                      {team.currentUserRole}
                    </span>
                  </div>
                </button>
              ))}
              {!loading && teams.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {isZh ? '还没有团队，先创建一个。' : 'No teams yet. Create one to start saving shared notes.'}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-[#202020]">
          <h3 className="text-lg font-semibold">{isZh ? '团队成员' : 'Team members'}</h3>
          {activeTeam ? (
            <>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {isZh
                  ? `当前选中团队：${activeTeam.name}。把已有账号通过邮箱加入团队后，他们就能看到该团队的团队笔记。`
                  : `Selected team: ${activeTeam.name}. Add existing users by email so they can access notes saved inside this team workspace.`}
              </p>

              <div className="mt-4 flex flex-col gap-3 md:flex-row">
                <input
                  value={memberEmail}
                  onChange={(event) => setMemberEmail(event.target.value)}
                  placeholder={isZh ? '输入成员邮箱' : 'Enter member email'}
                  className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-light dark:border-gray-700 dark:bg-[#181818]"
                />
                <button
                  type="button"
                  onClick={() => void handleAddMember()}
                  disabled={!memberEmail.trim() || submitting}
                  className="rounded-xl bg-primary-light px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-primary-dark"
                >
                  {isZh ? '添加成员' : 'Add member'}
                </button>
              </div>

              <div className="mt-6 space-y-3">
                {activeTeam.members.map((member) => (
                  <div
                    key={member.id}
                    className="flex flex-col gap-3 rounded-2xl border border-gray-200 px-4 py-3 dark:border-gray-700 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="font-medium">{member.email}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {member.role} · {new Date(member.joinedAt).toLocaleString(locale)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {member.role !== 'owner' ? (
                        <button
                          type="button"
                          onClick={() => void handleRemoveMember(member.id)}
                          disabled={submitting}
                          className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/20"
                        >
                          {isZh ? '移除' : 'Remove'}
                        </button>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600 dark:bg-[#181818] dark:text-gray-300">
                          {isZh ? '拥有者' : 'Owner'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {isZh ? '先选择一个团队，或先创建团队。' : 'Select a team first, or create one.'}
            </p>
          )}

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
              {error}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
