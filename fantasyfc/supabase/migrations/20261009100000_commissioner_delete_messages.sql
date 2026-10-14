create policy "Commissioners can soft-delete any message"
  on public.league_message for update
  to authenticated
  using (
    exists (
      select 1 from public.league_member
      where league_member.league_id = league_message.league_id
        and league_member.user_id = auth.uid()
        and league_member.role = 'COMMISSIONER'
    )
  )
  with check (
    is_deleted = true
    and deleted_by = auth.uid()
  );
